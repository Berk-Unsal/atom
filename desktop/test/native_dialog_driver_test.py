import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("native_dialog_driver", Path(__file__).with_name("native-dialog-driver.py"))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class API:
    STATE_SHOWING, STATE_ENABLED, STATE_SENSITIVE, STATE_EDITABLE = range(4)
    ROLE_TEXT, ROLE_PUSH_BUTTON = "text", "button"
    ROLE_TABLE, ROLE_TREE_TABLE = "table", "tree table"


class Node:
    def __init__(self, name, children=(), pid=1, visible=True, role="dialog", refused=False):
        self.name, self.children, self.pid, self.visible, self.role = name, children, pid, visible, role
        self.refused, self.text, self.clicked = refused, "", False
        self.nActions = 1

    def __iter__(self): return iter(self.children)
    def get_process_id(self): return self.pid
    def clear_cache(self): pass
    def getState(self): return self
    def contains(self, _flag): return self.visible
    def getRole(self): return self.role
    def getRoleName(self): return self.role
    def queryEditableText(self): return self
    def queryText(self): return self
    def setTextContents(self, text):
        if self.refused: return False
        self.text = text
        return True
    def getText(self, _start, _end): return self.text
    def queryAction(self): return self
    def getName(self, _index): return "click"
    def doAction(self, _index):
        self.clicked = True
        return True


class NativeDriverTest(unittest.TestCase):
    def test_open_navigates_the_visible_parent_folder_before_selecting_the_file(self):
        class FolderRow(Node):
            def doAction(self, _index):
                files.in_folder = True
                self.clicked = True
                return True
        class FileList(Node):
            nRows = 1
            in_folder = False
            selected = False
            def queryTable(self): return self
            def getAccessibleAt(self, _row, _column):
                return Node("cell", [Node("expected.json")]) if self.in_folder else folder
            def isRowSelected(self, _row): return self.selected
            def addRowSelection(self, _row): self.selected = True
        folder = FolderRow("cell", [Node("Documents")])
        files = FileList("Files", role="table")
        chooser = Node("chooser", [files]); target = Path("/tmp/Documents/expected.json")
        self.assertFalse(driver.select_open_path(chooser, target, API))
        self.assertTrue(folder.clicked)
        self.assertTrue(driver.select_open_path(chooser, target, API))

    def test_open_rechecks_file_identity_after_row_selection_changes(self):
        class FileList(Node):
            nRows = 1
            selected = False
            current_name = "expected.json"
            def queryTable(self): return self
            def getAccessibleAt(self, _row, _column): return Node("cell", [Node(self.current_name)])
            def isRowSelected(self, _row): return self.selected
            def addRowSelection(self, _row):
                self.selected = True
                self.current_name = "different.json"
        files = FileList("Files", role="table")
        self.assertFalse(driver.select_open_path(Node("chooser", [files]), Path("/tmp/expected.json"), API))

    def test_expired_children_do_not_destroy_the_owned_dialog_observation(self):
        class Expired(Node):
            def getRoleName(self): raise RuntimeError("Accessible no longer exists")
        root = Node("chooser", [Expired("old row"), Node("current row")])
        self.assertEqual(driver.snapshot(root), [{"name": "chooser", "role": "dialog"}, {"name": "current row", "role": "dialog"}])
    def test_accept_does_not_read_a_widget_after_its_action_destroys_it(self):
        class ClosingButton(Node):
            def __getattribute__(self, name):
                if name == "name" and object.__getattribute__(self, "clicked"):
                    raise RuntimeError("Accessible no longer exists")
                return super().__getattribute__(name)
        button = ClosingButton("_Cancel", role="button")
        self.assertEqual(driver.accept(Node("chooser", [button]), "cancel", API), "_Cancel")

    def test_only_the_exact_portal_pid_title_and_visible_dialog_is_selected(self):
        unrelated = Node("app", [Node("Save A.T.O.M project")], pid=9)
        hidden = Node("Save A.T.O.M project", visible=False)
        expected = Node("Save A.T.O.M project")
        owned = Node("portal", [hidden, Node("Another dialog"), expected], pid=42)
        self.assertIs(driver.find_dialog([unrelated, owned], 42, expected.name, API), expected)
        self.assertIsNone(driver.find_dialog([unrelated], 42, expected.name, API))

    def test_save_requires_a_single_editable_filename_and_verifies_native_readback(self):
        entry = Node("Name:", role="text")
        self.assertTrue(driver.set_save_path(Node("chooser", [entry]), Path("/tmp/Türkçe report.pdf"), API))
        self.assertEqual(entry.text, "/tmp/Türkçe report.pdf")
        with self.assertRaisesRegex(RuntimeError, "refused"):
            driver.set_save_path(Node("chooser", [Node("Name:", role="text", refused=True)]), Path("/tmp/report.pdf"), API)
        self.assertFalse(driver.set_save_path(Node("chooser", [Node("", role="text"), Node("", role="text")]), Path("/tmp/report.pdf"), API))

    def test_cancel_activates_only_the_enabled_cancel_button(self):
        save = Node("Save", role="button")
        disabled = Node("Cancel", role="button", visible=False)
        cancel = Node("_Cancel", role="button")
        self.assertEqual(driver.accept(Node("chooser", [save, disabled, cancel]), "cancel", API), "_Cancel")
        self.assertTrue(cancel.clicked)
        self.assertFalse(save.clicked or disabled.clicked)


if __name__ == "__main__":
    unittest.main()
