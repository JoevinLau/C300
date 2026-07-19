from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import db


class DatabasePoolTests(unittest.TestCase):
    def tearDown(self):
        db.close_pool()

    def test_desktop_default_does_not_eagerly_open_ten_connections(self):
        fake_pool = object()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(db, "_connection_config", return_value={}),
            patch.object(
                db.pooling,
                "MySQLConnectionPool",
                return_value=fake_pool,
            ) as create_pool,
        ):
            result = db.init_pool(force=True)

        self.assertIs(result, fake_pool)
        self.assertEqual(create_pool.call_args.kwargs["pool_size"], 3)


if __name__ == "__main__":
    unittest.main()
