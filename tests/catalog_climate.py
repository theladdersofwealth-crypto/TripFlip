import importlib.util
from pathlib import Path
import unittest

script = Path(__file__).resolve().parents[1] / "scripts" / "build-recent-climate.py"
spec = importlib.util.spec_from_file_location("build_recent_climate", script)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ClimateArithmeticTest(unittest.TestCase):
    def test_month_total_is_weighted_by_actual_days_then_averaged(self):
        monthly = {
            "t2m": [[273.15]] * 60, "t2m_max": [[283.15]] * 60,
            "pr": [[1 / 86400]] * 60, "snd": [[0.007]] * 60,
        }
        power = {"months": {"2": {"rainDays": 8.0, "sunHours": None}}}
        self.assertEqual(builder.record(0, 2, monthly, power), {
            "tmean": 0, "tmax": 10, "precipMm": 28.2, "snowWaterMm": 7,
            "rainDays": 8, "sunHours": None,
        })

    def test_negative_accumulations_are_not_published(self):
        monthly = {
            "t2m": [[273.15]] * 60, "t2m_max": [[283.15]] * 60,
            "pr": [[-1 / 86400]] * 60, "snd": [[0.007]] * 60,
        }
        with self.assertRaisesRegex(ValueError, "invalid precipitation"):
            builder.record(0, 2, monthly, {"months": {"2": {"rainDays": 1, "sunHours": 0}}})
