import importlib.util
from pathlib import Path
import unittest
from native_dialog_driver_test import API as DialogAPI, Node

spec = importlib.util.spec_from_file_location("native_print_driver", Path(__file__).with_name("native-print-driver.py"))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class API(DialogAPI):
    ROLE_DIALOG, ROLE_FRAME = "dialog", "frame"


class PrintDriverTest(unittest.TestCase):
    def test_renderer_print_button_is_not_a_native_dialog(self):
        button = Node("Print", role="button")
        app = Node("app", [button], pid=42)
        self.assertIsNone(driver.find_print_dialog([app], 42, API))
        self.assertFalse(button.clicked)

    def test_only_owned_visible_print_dialog_is_eligible(self):
        other = Node("other app", [Node("Print")], pid=1)
        hidden = Node("Print", visible=False)
        expected = Node("Print")
        app = Node("app", [hidden, Node("Print", role="button"), expected], pid=42)
        self.assertIs(driver.find_print_dialog([other, app], 42, API), expected)


if __name__ == "__main__":
    unittest.main()
