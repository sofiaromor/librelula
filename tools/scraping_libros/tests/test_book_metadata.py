import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scrapy import Request
from scrapy.http import HtmlResponse
from libros.spiders.libro import LibroSpider


class BookMetadataTests(unittest.TestCase):
    def parse(self, synopsis, examples):
        url = "https://www.casadellibro.com/libro-prueba/9788419030443/14149234"
        html = f'''<h1>Libro de prueba</h1><meta name="author" content="Autora">
        <h3 data-campo="Número de páginas">Número de páginas: 480</h3>
        <div class="resumen-content">{synopsis}</div>
        <script type="application/ld+json">{json.dumps([{"@type":"Book", "workExample":examples}])}</script>'''
        response = HtmlResponse(url=url, body=html.encode(), encoding="utf-8", request=Request(url))
        return list(LibroSpider().parse_libro(response))

    def test_synopsis_without_paragraphs_does_not_trigger_incomplete_retry(self):
        items = self.parse("Una aprendiz descubre un secreto.<br>Debe proteger el reino.", [])
        self.assertEqual(len(items), 1)
        self.assertNotIsInstance(items[0], Request)
        self.assertEqual(items[0]["sinopsis"], "Una aprendiz descubre un secreto. Debe proteger el reino.")

    def test_format_matches_current_isbn_not_other_edition(self):
        items = self.parse("Una historia de fantasía.", [
            {"isbn":"9788416517671", "bookFormat":"http://schema.org/Paperback"},
            {"isbn":"9788419030443", "bookFormat":"http://schema.org/Hardcover"},
        ])
        self.assertEqual(items[0]["encuadernacion"], "Tapa dura")

    def test_nested_paragraphs_remain_complete(self):
        items = self.parse("<p>Una historia <b>mágica</b>.</p><p>Segunda parte.</p>", [])
        self.assertEqual(items[0]["sinopsis"], "Una historia mágica . Segunda parte.")

    def test_structured_author_has_priority_over_publisher_meta_tag(self):
        url = "https://www.casadellibro.com/libro-prueba/9788419030443/1"
        html = '''<h1>Prueba</h1><meta name="author" content="Editorial">
        <h3 data-campo="Número de páginas">Número de páginas: 300</h3>
        <div class="resumen-content">Sinopsis completa.</div>
        <script type="application/ld+json">{"@graph":[{"@type":"Book","author":{"name":"Autora real"}}]}</script>'''
        response = HtmlResponse(url=url, body=html.encode(), encoding="utf-8", request=Request(url))
        item = list(LibroSpider().parse_libro(response))[0]
        self.assertEqual(item["autora"], "Autora real")

    def test_preserves_all_visible_coauthors(self):
        url = "https://www.casadellibro.com/libro-prueba/9788419030443/1"
        html = '''<h1>Prueba</h1><h3>Escrito por Margaret Weis</h3><h3>Escrito por Tracy Hickman</h3>
        <h3 data-campo="Número de páginas">Número de páginas: 300</h3>
        <div class="resumen-content">Sinopsis completa.</div>'''
        response = HtmlResponse(url=url, body=html.encode(), encoding="utf-8", request=Request(url))
        item = list(LibroSpider().parse_libro(response))[0]
        self.assertEqual(item["autora"], "Margaret Weis, Tracy Hickman")


if __name__ == "__main__":
    unittest.main()
