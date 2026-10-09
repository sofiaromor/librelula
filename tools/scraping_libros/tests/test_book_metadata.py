import unittest
from scrapy.http import HtmlResponse, Request
from libros.spiders.libro import LibroSpider


class BookMetadataTest(unittest.TestCase):
    def test_partial_retry_keeps_original_author_and_saga(self):
        url = "https://www.casadellibro.com/libro-example/9788419654977/123"
        first = '<h1>Example</h1><h3>Escrito por Example Author</h3><h3 data-campo="Serie/Saga">Serie/Saga: Example Series</h3><div data-campo="Número">Número: 5</div>'
        spider = LibroSpider()
        response = HtmlResponse(url, body=first.encode(), encoding="utf-8", request=Request(url))
        retry = list(spider.parse_libro(response))[0]
        self.assertIsInstance(retry, Request)
        second = '<h1>Example</h1><div class="resumen-content"><p>Synopsis.</p></div><div data-campo="Número de páginas">Número de páginas: 272</div>'
        response = HtmlResponse(url, body=second.encode(), encoding="utf-8", request=retry)
        item = list(spider.parse_libro(response))[0]
        self.assertEqual(item["autora"], "Example Author")
        self.assertEqual(item["saga"], "Example Series")
        self.assertEqual(item["saga_numero"], 5)
        self.assertEqual(item["numero_paginas"], 272)

    def test_technical_fields_can_be_divs_and_saga_numbers_are_preserved(self):
        url = "https://www.casadellibro.com/libro-example/9788419654977/123"
        html = '''<h1>Example</h1><h3>Escrito por Example Author</h3>
        <div class="resumen-content"><p>Example synopsis.</p></div>
        <div data-campo="ISBN"><b>ISBN:</b>9788419654977</div>
        <div data-campo="Número de páginas"><b>Número de páginas:</b>272</div>
        <div data-campo="Editorial"><b>Editorial:</b>Example Publisher</div>
        <h3 data-campo="Serie/Saga"><b>Serie/Saga:</b>Example Series</h3>
        <div data-campo="Número"><b>Número:</b>5</div>'''
        response = HtmlResponse(url, body=html.encode(), encoding="utf-8", request=Request(url))
        results = list(LibroSpider().parse_libro(response))
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["autora"], "Example Author")
        self.assertEqual(results[0]["numero_paginas"], 272)
        self.assertEqual(results[0]["editorial"], "Example Publisher")
        self.assertEqual(results[0]["saga"], "Example Series")
        self.assertEqual(results[0]["saga_numero"], 5)


if __name__ == "__main__":
    unittest.main()
