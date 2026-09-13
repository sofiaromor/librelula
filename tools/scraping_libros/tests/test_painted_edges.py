import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from libros.painted_edges import detect_painted_edges


class PaintedEdgesTests(unittest.TestCase):
    def test_frontend_and_scraper_share_the_same_candidate_cases(self):
        cases = json.loads((ROOT / "frontend/tests/fixtures/painted-edges.json").read_text())
        for case in cases:
            with self.subTest(case=case["name"]):
                result = detect_painted_edges(case["item"])
                self.assertEqual(result["status"], case["status"])
                self.assertEqual(result["reason"], case["reason"])
                self.assertNotIn("fore_edge_quad", result)

    def test_preparation_recomputes_stale_flags_and_preserves_original_images(self):
        path = ROOT / "tools/scraping_libros/scripts/preparar_importacion.py"
        spec = importlib.util.spec_from_file_location("prepare", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        photo = "https://images.example.test/original.webp"
        raw = {"titulo":"Odisea (cantos decorados)", "autora":"Homero", "isbn":"9788491058090", "imagen_portada":photo, "imagen_producto":photo, "painted_edges":{"status":"none"}}
        result = module.transformar(raw, 1)
        self.assertEqual(result["painted_edges"]["status"], "explicit")
        self.assertEqual(result["cover"], photo)
        self.assertEqual(result["product_image_url"], photo)
        self.assertNotIn("fore_edge_quad", result)
        self.assertFalse(result["selected"])


if __name__ == "__main__":
    unittest.main()
