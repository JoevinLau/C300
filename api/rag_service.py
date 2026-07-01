from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable


SUPPORTED_EXTENSIONS = {".pdf", ".xlsx"}
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_TOP_K = 6
DEFAULT_SCORE_THRESHOLD = 0.25


class RagError(Exception):
    pass


class UnsupportedDocumentError(RagError):
    pass


class EmptyDocumentError(RagError):
    pass


@dataclass(frozen=True)
class ExtractedSection:
    text: str
    location: str
    page: int | None = None
    sheet: str | None = None
    row_start: int | None = None
    row_end: int | None = None


@dataclass(frozen=True)
class DocumentRecord:
    document_id: str
    filename: str
    file_type: str
    content_hash: str
    chunk_count: int
    status: str = "indexed"
    error: str | None = None


@dataclass(frozen=True)
class SearchResult:
    document_id: str
    filename: str
    location: str
    excerpt: str
    score: float


def _safe_workspace_id(workspace_id: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]", "-", workspace_id.strip())
    if not normalized or normalized in {".", ".."}:
        raise RagError("workspace_id must contain at least one letter or number")
    return normalized[:100]


def _content_hash(contents: bytes) -> str:
    return hashlib.sha256(contents).hexdigest()


def _tokenizer() -> Any:
    try:
        import tiktoken

        return tiktoken.get_encoding("cl100k_base")
    except ImportError as exc:
        raise RagError(
            "Python dependency tiktoken is missing. Install api/requirements.txt."
        ) from exc


def chunk_text(
    text: str,
    *,
    target_tokens: int = 600,
    overlap_tokens: int = 100,
) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []

    encoding = _tokenizer()
    tokens = encoding.encode(cleaned)
    if len(tokens) <= target_tokens:
        return [cleaned]

    chunks: list[str] = []
    step = max(1, target_tokens - overlap_tokens)
    for start in range(0, len(tokens), step):
        token_slice = tokens[start : start + target_tokens]
        if not token_slice:
            break
        chunk = encoding.decode(token_slice).strip()
        if chunk:
            chunks.append(chunk)
        if start + target_tokens >= len(tokens):
            break
    return chunks


def extract_pdf(contents: bytes) -> list[ExtractedSection]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RagError(
            "Python dependency pypdf is missing. Install api/requirements.txt."
        ) from exc

    try:
        reader = PdfReader(BytesIO(contents))
        sections = []
        for page_number, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                sections.append(
                    ExtractedSection(
                        text=text,
                        location=f"page {page_number}",
                        page=page_number,
                    )
                )
        return sections
    except Exception as exc:
        raise RagError(f"Failed to parse PDF: {exc}") from exc


def extract_xlsx(contents: bytes, *, rows_per_section: int = 25) -> list[ExtractedSection]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise RagError(
            "Python dependency openpyxl is missing. Install api/requirements.txt."
        ) from exc

    try:
        workbook = load_workbook(BytesIO(contents), read_only=True, data_only=True)
        sections: list[ExtractedSection] = []
        for sheet in workbook.worksheets:
            rows = [
                [str(cell) if cell is not None else "" for cell in row]
                for row in sheet.iter_rows(values_only=True)
            ]
            rows = [row for row in rows if any(cell.strip() for cell in row)]
            if not rows:
                continue

            header = rows[0]
            data_rows = rows[1:] or [rows[0]]
            for offset in range(0, len(data_rows), rows_per_section):
                batch = data_rows[offset : offset + rows_per_section]
                row_start = offset + 2 if len(rows) > 1 else 1
                row_end = row_start + len(batch) - 1
                lines = [
                    f"Sheet: {sheet.title}",
                    "Columns: " + " | ".join(header),
                    *[" | ".join(row) for row in batch],
                ]
                sections.append(
                    ExtractedSection(
                        text="\n".join(lines),
                        location=f"sheet {sheet.title}, rows {row_start}-{row_end}",
                        sheet=sheet.title,
                        row_start=row_start,
                        row_end=row_end,
                    )
                )
        workbook.close()
        return sections
    except Exception as exc:
        raise RagError(f"Failed to parse spreadsheet: {exc}") from exc


def extract_document(filename: str, contents: bytes) -> list[ExtractedSection]:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedDocumentError(
            f"Unsupported file type '{extension or 'unknown'}'. Upload PDF or XLSX files."
        )
    if not contents:
        raise EmptyDocumentError("The uploaded file is empty.")

    sections = extract_pdf(contents) if extension == ".pdf" else extract_xlsx(contents)
    if not sections:
        raise EmptyDocumentError("No readable text or spreadsheet rows were found.")
    return sections


def _chunk_sections(sections: Iterable[ExtractedSection]) -> list[tuple[str, ExtractedSection]]:
    chunks: list[tuple[str, ExtractedSection]] = []
    for section in sections:
        for text in chunk_text(section.text):
            chunks.append((text, section))
    return chunks


class RagService:
    def __init__(
        self,
        data_root: Path | str | None = None,
        *,
        openai_client: Any | None = None,
    ) -> None:
        configured_root = data_root or os.getenv("RAG_DATA_DIR")
        self.data_root = Path(configured_root or Path.home() / ".c300" / "rag")
        self.embedding_model = os.getenv(
            "RAG_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL
        )
        self.top_k = int(os.getenv("RAG_TOP_K", str(DEFAULT_TOP_K)))
        self.score_threshold = float(
            os.getenv("RAG_SCORE_THRESHOLD", str(DEFAULT_SCORE_THRESHOLD))
        )
        self._openai_client = openai_client
        self._clients: dict[str, Any] = {}
        self._collections: dict[str, Any] = {}
        self._lock = threading.RLock()

    def _workspace_dir(self, workspace_id: str) -> Path:
        workspace_dir = self.data_root / "workspaces" / _safe_workspace_id(workspace_id)
        workspace_dir.mkdir(parents=True, exist_ok=True)
        return workspace_dir

    def _manifest_path(self, workspace_id: str) -> Path:
        return self._workspace_dir(workspace_id) / "documents.json"

    def _load_manifest(self, workspace_id: str) -> list[DocumentRecord]:
        path = self._manifest_path(workspace_id)
        if not path.exists():
            return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return [DocumentRecord(**item) for item in payload]
        except (OSError, ValueError, TypeError) as exc:
            raise RagError(f"Failed to read document index: {exc}") from exc

    def _save_manifest(
        self, workspace_id: str, documents: list[DocumentRecord]
    ) -> None:
        path = self._manifest_path(workspace_id)
        temporary_path = path.with_suffix(".tmp")
        temporary_path.write_text(
            json.dumps([asdict(document) for document in documents], indent=2),
            encoding="utf-8",
        )
        temporary_path.replace(path)

    def _collection(self, workspace_id: str) -> Any:
        safe_id = _safe_workspace_id(workspace_id)
        if safe_id in self._collections:
            return self._collections[safe_id]

        try:
            import chromadb
        except ImportError as exc:
            raise RagError(
                "Python dependency chromadb is missing. Install api/requirements.txt."
            ) from exc

        client = chromadb.PersistentClient(
            path=str(self._workspace_dir(safe_id) / "chroma")
        )
        collection = client.get_or_create_collection(
            name="supplier_documents",
            metadata={"hnsw:space": "cosine"},
        )
        self._clients[safe_id] = client
        self._collections[safe_id] = collection
        return collection

    def close(self) -> None:
        with self._lock:
            for client in self._clients.values():
                close = getattr(client, "close", None)
                if callable(close):
                    close()
            self._collections.clear()
            self._clients.clear()

    def _openai(self) -> Any:
        if self._openai_client is not None:
            return self._openai_client
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RagError(
                "Python dependency openai is missing. Install api/requirements.txt."
            ) from exc
        self._openai_client = OpenAI(api_key=_get_ai_key())
        return self._openai_client

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = self._openai().embeddings.create(
                model=self.embedding_model,
                input=texts,
                encoding_format="float",
            )
            ordered = sorted(response.data, key=lambda item: item.index)
            return [item.embedding for item in ordered]
        except Exception as exc:
            raise RagError(f"Embedding request failed: {exc}") from exc

    def list_documents(self, workspace_id: str) -> list[DocumentRecord]:
        with self._lock:
            return self._load_manifest(workspace_id)

    def ingest(
        self, workspace_id: str, filename: str, contents: bytes
    ) -> DocumentRecord:
        content_hash = _content_hash(contents)
        extension = Path(filename).suffix.lower()

        with self._lock:
            documents = self._load_manifest(workspace_id)
            duplicate = next(
                (
                    document
                    for document in documents
                    if document.filename == filename
                    and document.content_hash == content_hash
                ),
                None,
            )
            if duplicate:
                return duplicate

            sections = extract_document(filename, contents)
            chunks = _chunk_sections(sections)
            if not chunks:
                raise EmptyDocumentError("No indexable content was found.")

            embeddings = self._embed([text for text, _section in chunks])
            if len(embeddings) != len(chunks):
                raise RagError("Embedding response count did not match the document chunks.")

            collection = self._collection(workspace_id)
            replaced = [
                document for document in documents if document.filename == filename
            ]
            for document in replaced:
                collection.delete(where={"document_id": document.document_id})

            document_id = str(uuid.uuid4())
            ids = [f"{document_id}:{index}" for index in range(len(chunks))]
            metadatas = []
            for index, (_text, section) in enumerate(chunks):
                metadata: dict[str, str | int] = {
                    "document_id": document_id,
                    "filename": filename,
                    "file_type": extension.lstrip("."),
                    "location": section.location,
                    "chunk_index": index,
                    "content_hash": content_hash,
                }
                if section.page is not None:
                    metadata["page"] = section.page
                if section.sheet is not None:
                    metadata["sheet"] = section.sheet
                if section.row_start is not None:
                    metadata["row_start"] = section.row_start
                if section.row_end is not None:
                    metadata["row_end"] = section.row_end
                metadatas.append(metadata)

            collection.add(
                ids=ids,
                documents=[text for text, _section in chunks],
                embeddings=embeddings,
                metadatas=metadatas,
            )
            record = DocumentRecord(
                document_id=document_id,
                filename=filename,
                file_type=extension.lstrip("."),
                content_hash=content_hash,
                chunk_count=len(chunks),
            )
            remaining = [
                document for document in documents if document.filename != filename
            ]
            self._save_manifest(workspace_id, [*remaining, record])
            return record

    def delete_document(self, workspace_id: str, document_id: str) -> bool:
        with self._lock:
            documents = self._load_manifest(workspace_id)
            if not any(
                document.document_id == document_id for document in documents
            ):
                return False
            self._collection(workspace_id).delete(
                where={"document_id": document_id}
            )
            self._save_manifest(
                workspace_id,
                [
                    document
                    for document in documents
                    if document.document_id != document_id
                ],
            )
            return True

    def search(self, workspace_id: str, query: str) -> list[SearchResult]:
        if not query.strip() or not self.list_documents(workspace_id):
            return []

        query_embedding = self._embed([query])[0]
        result = self._collection(workspace_id).query(
            query_embeddings=[query_embedding],
            n_results=self.top_k,
            include=["documents", "metadatas", "distances"],
        )
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        matches = []
        for text, metadata, distance in zip(documents, metadatas, distances):
            score = max(0.0, min(1.0, 1.0 - float(distance)))
            if score < self.score_threshold:
                continue
            matches.append(
                SearchResult(
                    document_id=str(metadata["document_id"]),
                    filename=str(metadata["filename"]),
                    location=str(metadata["location"]),
                    excerpt=str(text)[:500],
                    score=round(score, 4),
                )
            )
        return matches


def _get_ai_key() -> str:
    for env_name in ("AI_KEY", "OPENAI_API_KEY"):
        value = os.getenv(env_name)
        if value and value.strip():
            return value.strip()
    raise RagError("AI_KEY or OPENAI_API_KEY environment variable is not set.")
