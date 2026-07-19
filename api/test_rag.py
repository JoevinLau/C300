from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from openpyxl import Workbook

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from rag_service import (
    DocumentRecord,
    RagError,
    RagService,
    SearchResult,
    VectorRecord,
    chunk_text,
    extract_xls,
    extract_pdf,
    extract_xlsx,
)


class FakeEmbeddings:
    def create(self, *, input, **_kwargs):
        data = [
            SimpleNamespace(index=index, embedding=[1.0, 0.0, 0.0])
            for index, _text in enumerate(input)
        ]
        return SimpleNamespace(data=data)


class FakeOpenAI:
    def __init__(self):
        self.embeddings = FakeEmbeddings()


def make_workbook(rows: list[list[str]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Supplier data"
    for row in rows:
        sheet.append(row)
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


class RagServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.service = RagService(
            self.temporary_directory.name,
            openai_client=FakeOpenAI(),
        )

    def tearDown(self):
        self.service.close()
        self.temporary_directory.cleanup()

    def test_chunk_text_uses_overlap(self):
        text = " ".join(f"token-{index}" for index in range(100))
        chunks = chunk_text(text, target_tokens=40, overlap_tokens=10)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(set(chunks[0].split()) & set(chunks[1].split()))

    def test_extract_xlsx_preserves_sheet_and_rows(self):
        contents = make_workbook(
            [["Material", "PCF"], ["Aluminium", "8.2"], ["Steel", "4.1"]]
        )
        sections = extract_xlsx(contents, rows_per_section=1)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0].sheet, "Supplier data")
        self.assertEqual(sections[0].row_start, 2)
        self.assertIn("Columns: Material | PCF", sections[0].text)

    def test_extract_xls_preserves_sheet_and_rows(self):
        import pandas as pd

        frame = pd.DataFrame(
            [["Material", "PCF"], ["Aluminium", "8.2"], ["Steel", "4.1"]]
        )
        with patch("pandas.read_excel", return_value={"Supplier data": frame}):
            sections = extract_xls(b"fake xls", rows_per_section=1)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0].sheet, "Supplier data")
        self.assertEqual(sections[0].row_start, 2)
        self.assertIn("Columns: Material | PCF", sections[0].text)

    def test_extract_pdf_preserves_page_number(self):
        fake_page = SimpleNamespace(extract_text=lambda: "Supplier PCF is 8.2 kg CO2e.")
        with patch("pypdf.PdfReader", return_value=SimpleNamespace(pages=[fake_page])):
            sections = extract_pdf(b"%PDF fake")
        self.assertEqual(sections[0].page, 1)
        self.assertEqual(sections[0].location, "page 1")

    def test_ingest_deduplicates_and_replaces_changed_filename(self):
        first = make_workbook([["Material", "PCF"], ["Aluminium", "8.2"]])
        duplicate_one = self.service.ingest("workspace-a", "supplier.xlsx", first)
        duplicate_two = self.service.ingest("workspace-a", "supplier.xlsx", first)
        self.assertEqual(duplicate_one.document_id, duplicate_two.document_id)

        changed = make_workbook([["Material", "PCF"], ["Aluminium", "7.9"]])
        replacement = self.service.ingest("workspace-a", "supplier.xlsx", changed)
        self.assertNotEqual(duplicate_one.document_id, replacement.document_id)
        documents = self.service.list_documents("workspace-a")
        self.assertEqual([replacement.document_id], [item.document_id for item in documents])

    def test_workspace_isolation_search_and_delete(self):
        contents = make_workbook([["Material", "PCF"], ["Aluminium", "8.2"]])
        record = self.service.ingest("workspace-a", "supplier.xlsx", contents)

        self.assertEqual(self.service.list_documents("workspace-b"), [])
        self.assertEqual(self.service.search("workspace-b", "aluminium"), [])

        results = self.service.search("workspace-a", "aluminium")
        self.assertEqual(results[0].document_id, record.document_id)
        self.assertEqual(results[0].location, "sheet Supplier data, rows 2-2")
        self.assertTrue(self.service.delete_document("workspace-a", record.document_id))
        self.assertEqual(self.service.list_documents("workspace-a"), [])
        self.assertFalse(self.service.delete_document("workspace-a", record.document_id))

    def test_failed_workspace_commit_preserves_previous_snapshot(self):
        first = make_workbook([["Material", "PCF"], ["Aluminium", "8.2"]])
        first_record = self.service.ingest("workspace-a", "first.xlsx", first)
        primary_path = self.service._index_path("workspace-a")
        real_replace = os.replace

        def fail_primary_replace(source, destination):
            if Path(destination) == primary_path:
                raise OSError("simulated disk failure")
            return real_replace(source, destination)

        second = make_workbook([["Material", "PCF"], ["Steel", "4.1"]])
        with (
            patch("rag_service.os.replace", side_effect=fail_primary_replace),
            self.assertRaises(RagError),
        ):
            self.service.ingest("workspace-a", "second.xlsx", second)

        reopened = RagService(
            self.temporary_directory.name,
            openai_client=FakeOpenAI(),
        )
        documents = reopened.list_documents("workspace-a")
        self.assertEqual([item.document_id for item in documents], [first_record.document_id])

    def test_corrupt_primary_index_recovers_from_validated_backup(self):
        first = make_workbook([["Material", "PCF"], ["Aluminium", "8.2"]])
        first_record = self.service.ingest("workspace-a", "first.xlsx", first)
        second = make_workbook([["Material", "PCF"], ["Steel", "4.1"]])
        self.service.ingest("workspace-a", "second.xlsx", second)

        self.service._index_path("workspace-a").write_text(
            "{not valid json", encoding="utf-8"
        )

        reopened = RagService(
            self.temporary_directory.name,
            openai_client=FakeOpenAI(),
        )
        documents = reopened.list_documents("workspace-a")
        self.assertEqual([item.document_id for item in documents], [first_record.document_id])

    def test_inconsistent_primary_index_recovers_from_validated_backup(self):
        first = make_workbook([["Material", "PCF"], ["Aluminium", "8.2"]])
        first_record = self.service.ingest("workspace-a", "first.xlsx", first)
        second = make_workbook([["Material", "PCF"], ["Steel", "4.1"]])
        self.service.ingest("workspace-a", "second.xlsx", second)

        index_path = self.service._index_path("workspace-a")
        payload = json.loads(index_path.read_text(encoding="utf-8"))
        payload["documents"][1]["chunk_count"] = 999
        index_path.write_text(json.dumps(payload), encoding="utf-8")

        reopened = RagService(
            self.temporary_directory.name,
            openai_client=FakeOpenAI(),
        )
        documents = reopened.list_documents("workspace-a")
        self.assertEqual([item.document_id for item in documents], [first_record.document_id])

    def test_legacy_split_index_migrates_without_orphan_vectors(self):
        workspace_dir = Path(self.temporary_directory.name) / "workspaces" / "legacy"
        workspace_dir.mkdir(parents=True)
        document = DocumentRecord(
            document_id="doc-1",
            filename="supplier.pdf",
            file_type="pdf",
            content_hash="hash",
            chunk_count=1,
        )
        valid_vector = VectorRecord(
            id="doc-1:0",
            text="Supplier evidence",
            embedding=[1.0, 0.0],
            metadata={
                "document_id": "doc-1",
                "filename": "supplier.pdf",
                "location": "page 1",
            },
        )
        orphan_vector = VectorRecord(
            id="orphan:0",
            text="Uncommitted evidence",
            embedding=[0.0, 1.0],
            metadata={
                "document_id": "orphan",
                "filename": "other.pdf",
                "location": "page 2",
            },
        )
        (workspace_dir / "documents.json").write_text(
            json.dumps([document.__dict__]), encoding="utf-8"
        )
        (workspace_dir / "vectors.json").write_text(
            json.dumps([valid_vector.__dict__, orphan_vector.__dict__]),
            encoding="utf-8",
        )

        documents = self.service.list_documents("legacy")

        self.assertEqual([item.document_id for item in documents], ["doc-1"])
        migrated = json.loads((workspace_dir / "index.json").read_text(encoding="utf-8"))
        self.assertEqual([item["id"] for item in migrated["vectors"]], ["doc-1:0"])

    def test_search_filters_low_relevance_results(self):
        record = DocumentRecord(
            document_id="doc-1",
            filename="supplier.pdf",
            file_type="pdf",
            content_hash="hash",
            chunk_count=1,
        )
        self.service._save_index(
            "workspace-a",
            [record],
            [
                VectorRecord(
                    id="doc-1:0",
                    text="Unrelated supplier text",
                    embedding=[0.0, 1.0],
                    metadata={
                        "document_id": "doc-1",
                        "filename": "supplier.pdf",
                        "location": "page 1",
                    },
                )
            ],
        )
        with patch.object(self.service, "_embed", return_value=[[1.0, 0.0]]):
            self.assertEqual(self.service.search("workspace-a", "PCF"), [])


class FakeApiRagService:
    def __init__(self, matches=None):
        self.matches = matches or []

    def search(self, _workspace_id, _query):
        return self.matches

    def list_documents(self, _workspace_id):
        return []


class RagApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("AI_KEY", "test-key")
        import main

        cls.main = main
        cls.client = TestClient(main.app)

    def test_chat_returns_explicit_ungrounded_response(self):
        with patch.object(self.main, "rag_service", FakeApiRagService()):
            response = self.client.post(
                "/method2-chat",
                json={
                    "workspace_id": "workspace-a",
                    "message": "What is the supplier PCF?",
                    "calculation_context": {},
                    "messages": [],
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["grounded"])
        self.assertEqual(response.json()["citations"], [])

    def test_chat_returns_retrieved_citations(self):
        match = SearchResult(
            document_id="doc-1",
            filename="supplier.xlsx",
            location="sheet Data, rows 2-4",
            excerpt="Product carbon footprint: 8.2 kg CO2e.",
            score=0.91,
        )
        fake_response = SimpleNamespace(output_text="The PCF is 8.2 kg CO2e. [Source 1]")
        fake_client = SimpleNamespace(
            responses=SimpleNamespace(create=lambda **_kwargs: fake_response)
        )
        with (
            patch.object(
                self.main, "rag_service", FakeApiRagService(matches=[match])
            ),
            patch("openai.OpenAI", return_value=fake_client),
        ):
            response = self.client.post(
                "/method2-chat",
                json={
                    "workspace_id": "workspace-a",
                    "message": "What is the supplier PCF?",
                    "calculation_context": {"part": "A"},
                    "messages": [],
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["grounded"])
        self.assertEqual(response.json()["citations"][0]["document_id"], "doc-1")


if __name__ == "__main__":
    unittest.main()
