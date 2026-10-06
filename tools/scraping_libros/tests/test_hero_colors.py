import sys
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from enriquecer_colores import dominant_color, readable_hero


class HeroColorTests(unittest.TestCase):
    def test_exterior_white_margins_do_not_set_book_color(self):
        image = Image.new("RGB", (20, 20), "white")
        for y in range(5, 15):
            for x in range(5, 15):
                image.putpixel((x, y), (68, 52, 92))
        image.putpixel((10, 10), (240, 30, 20))
        self.assertEqual(dominant_color(image), "#44345C")

    def test_light_cover_stays_in_its_color_family_with_readable_panel(self):
        self.assertEqual(readable_hero("#F0D0A0"), "#9C8768")
        self.assertEqual(readable_hero("#44345C"), "#44345C")

    def test_white_background_inside_angled_book_bounds_is_not_cover_color(self):
        image = Image.new("RGB", (60, 60), "white")
        ImageDraw.Draw(image).polygon([(5, 5), (55, 5), (5, 55)], fill=(68, 52, 92))
        self.assertEqual(dominant_color(image), "#44345C")

    def test_white_artwork_enclosed_by_cover_border_remains_part_of_cover(self):
        image = Image.new("RGB", (20, 20), (68, 52, 92))
        ImageDraw.Draw(image).rectangle((2, 2, 17, 17), fill="white")
        self.assertEqual(dominant_color(image), "#FFFFFF")

    def test_shades_of_cover_hue_outweigh_uniform_photo_shadow(self):
        image = Image.new("RGB", (10, 10), (120, 120, 120))
        for y in range(6):
            for x in range(10):
                scale = .35 + .1 * y
                image.putpixel((x, y), tuple(int(c * scale) for c in (140, 40, 200)))
        rgb = tuple(int(dominant_color(image)[i:i+2], 16) for i in (1, 3, 5))
        self.assertGreater(rgb[2], rgb[0])
        self.assertGreater(rgb[0], rgb[1])

    def test_fully_transparent_image_is_not_silently_given_default_color(self):
        with self.assertRaises(ValueError):
            dominant_color(Image.new("RGBA", (10, 10), (0, 0, 0, 0)))


if __name__ == "__main__":
    unittest.main()
