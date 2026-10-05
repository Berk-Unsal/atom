import hashlib,json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from supplement_input_audit import audit_copies
class SupplementalCopyTests(unittest.TestCase):
 def test_fixture_and_plan_tampering_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   folder=pathlib.Path(tmp);g=folder/'geometry';g.mkdir()
   (g/'certification-lock.json').write_bytes(b'parent');(folder/'fixed.test').write_bytes(b'binary');(g/'fixture.json').write_bytes(b'fixture')
   plan=[{'fixture':'fixture','operation':'building-entry','repeat':0}];(g/'plans-A-science-0.json').write_text(json.dumps(plan))
   digest=lambda b:hashlib.sha256(b).hexdigest()
   main={'fixture_sha256':{'fixture.json':digest(b'fixture')}};supp={'binary_sha256':digest(b'binary'),'plans':{'A-science-0':plan}}
   self.assertEqual(audit_copies(folder,main,supp,digest(b'parent'))['fixture_count'],1)
   (g/'fixture.json').write_bytes(b'changed')
   with self.assertRaises(ValueError):audit_copies(folder,main,supp,digest(b'parent'))
   (g/'fixture.json').write_bytes(b'fixture');(g/'plans-A-science-0.json').write_text('[]')
   with self.assertRaises(ValueError):audit_copies(folder,main,supp,digest(b'parent'))
if __name__=='__main__':unittest.main()
