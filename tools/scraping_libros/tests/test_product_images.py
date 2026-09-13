import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from libros.product_images import best_srcset_image, product_image_gallery


class ProductImageTests(unittest.TestCase):
    def test_prefers_largest_product_source_without_guessing_a_new_cdn_url(self):
        self.assertEqual(best_srcset_image("/small.jpg 150w, /original.jpg 1200w, /medium.jpg 600w"), "/original.jpg")
        self.assertIsNone(best_srcset_image(None))

    def test_original_gallery_is_unique_and_secure(self):
        self.assertEqual(product_image_gallery("https://www.casadellibro.com/libro", ["/cover.jpg", "//www.casadellibro.com/cover.jpg", "http://cdn.example.test/edge.jpg", "javascript:bad", "https://u:p@bad.test/x"]), ["https://www.casadellibro.com/cover.jpg", "https://cdn.example.test/edge.jpg"])

    def test_jsonld_only_collects_book_product_faces_not_author_portraits(self):
        doc = json.dumps({"@graph": [{"@type":"Product", "image":["https://cdn.example.test/front.jpg", {"url":"https://cdn.example.test/edge.jpg"}], "author":{"image":"https://cdn.example.test/author.jpg"}}, {"@type":"Organization", "image":"https://cdn.example.test/logo.jpg"}]})
        self.assertEqual(len(product_image_gallery("https://example.test", [], ["broken json", doc])), 2)

    def test_gallery_is_bounded_and_does_not_infer_face_labels(self):
        images = product_image_gallery("https://example.test", [f"/{i}.jpg" for i in range(30)])
        self.assertEqual(len(images), 8)
        self.assertTrue(all(isinstance(image, str) for image in images))


if __name__ == "__main__":
    unittest.main()
