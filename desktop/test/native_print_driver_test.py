import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("native_print_driver", Path(__file__).with_name("native-print-driver.py"))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def word(text, x, y, blue=False):
    return {"text": text, "left": x, "top": y, "width": 40, "height": 12,
            "blue_region": (x-5, y-5, x+200, y+20) if blue else None}


def fixture(header):
    return [word("Print", 700 if header else 300, 215 if header else 10),
            word("Cancel", 399 if header else 469, 215 if header else 517),
            word("Print", 1000 if header else 562, 215 if header else 517),
            word("General", 396 if header else 21, 257 if header else 48),
            word("Printer", 425 if header else 49, 301 if header else 94),
            word("AtomQualification", 421 if header else 47, 350 if header else 142, blue=True)]


class PrintDriverTest(unittest.TestCase):
    def test_resolves_real_header_and_bottom_row_layouts(self):
        for header in (True, False):
            widgets = driver.identify_print_widgets(fixture(header))
            self.assertEqual(widgets["print"]["left"], 1000 if header else 562)
            self.assertEqual(widgets["cancel"]["text"], "Cancel")

    def test_renderer_print_button_alone_is_not_a_native_print_surface(self):
        with self.assertRaises(RuntimeError): driver.identify_print_widgets([word("Print", 20, 20)])

    def test_requires_visibly_selected_local_queue(self):
        words = fixture(True)
        words[-1]["blue_region"] = None
        with self.assertRaises(RuntimeError): driver.identify_print_widgets(words)

    def test_rejects_ambiguous_cancel_and_unaligned_accept_control(self):
        with self.assertRaises(RuntimeError): driver.identify_print_widgets(fixture(True)+[word("Cancel", 20, 20)])
        words = fixture(False)
        words[2]["top"] = 700
        with self.assertRaises(RuntimeError): driver.identify_print_widgets(words)

    def test_requires_native_title_tab_and_printer_table(self):
        for missing in (0, 3, 4):
            words = fixture(False)
            del words[missing]
            with self.assertRaises(RuntimeError): driver.identify_print_widgets(words)


if __name__ == "__main__":
    unittest.main()
