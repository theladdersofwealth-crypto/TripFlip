import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dining', ROOT / 'scripts/catalog/dining.py')
dining = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dining)

class DiningTests(unittest.TestCase):
    def test_nested_markup_does_not_split_a_listing(self):
        text = '{{eat|name=[[Cafe|A Cafe]]|lat=1|long=2|content=Food {{lang|vi|phở}} and [[A|B]].}}'
        kind, row = list(dining.listings(text))[0]
        self.assertEqual(kind, 'eat')
        self.assertEqual(dining.clean(row['name']), 'A Cafe')
        self.assertIn('{{lang|vi|phở}}', row['content'])

    def test_unknown_cuisine_is_not_called_local(self):
        self.assertEqual(dining.classify('A restaurant', 'Meals available.', 'NT'), ([], None))

    def test_unknown_or_out_of_range_coordinates_stay_unknown(self):
        self.assertEqual(dining.coordinates({'lat': '', 'long': ''}), (None, None))
        self.assertEqual(dining.coordinates({'lat': '999', 'long': '10'}), (None, None))

    def test_rebuild_preserves_actual_source_check_date(self):
        source = ROOT / 'data/imports/sources/wikivoyage'
        with tempfile.TemporaryDirectory() as tmp:
            database = Path(tmp) / 'dining.sqlite'
            payload = dining.build(source, Path(tmp) / 'catalog.json', database)
            import sqlite3
            with sqlite3.connect(database) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM dining').fetchone()[0], len(payload['places']))
        receipt = json.loads((source / 'acquisition.json').read_text())
        dates = {r['retrievedAt'][:10] for r in receipt.values()}
        self.assertTrue(all(p['checkedAt'] in dates for p in payload['places']))
        self.assertEqual(len(payload['places']), len({p['id'] for p in payload['places']}))

if __name__ == '__main__': unittest.main()
