import pathlib,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import analyze
import report

class CompletedLedgerAnalysisTests(unittest.TestCase):
 def test_current_partial_evidence_cannot_certify(self):
  if not (analyze.WORK/'geometry'/'environment.json').exists():self.skipTest('no local study evidence')
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/'docs').mkdir()
   # Read real observations but never archive an unfinished ledger or modify published results.
   with patch.object(analyze,'ROOT',root),patch.object(analyze,'archive',lambda p:{'path':p.name,'test_only':True}):
    result=analyze.analyze()
   for profile,info in result['profiles'].items():
    if not info['complete']:self.assertNotIn(profile,result['certified_profile_ids'])
   self.assertEqual(result['planned_groups'],2704)
   self.assertIn('surface_static_validation_correction',result)
   self.assertTrue((root/'docs/fixed-deployment-profile-certification.json').exists())
   if not result['all_planned_complete']:
    with patch.object(report,'ROOT',root):
     with self.assertRaises(ValueError):report.report()

if __name__=='__main__':unittest.main()

class ReportRenderingTests(unittest.TestCase):
 def test_renderer_tables_and_fields_using_only_temporary_output(self):
  if not (analyze.WORK/'geometry'/'environment.json').exists():self.skipTest('no local observations')
  import json
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/'docs').mkdir()
   with patch.object(analyze,'ROOT',root),patch.object(analyze,'archive',lambda p:{'path':p.name,'test_only':True}):
    fixture=analyze.analyze()
   # Renderer-only test fixture. Never publish, archive or score as completed evidence.
   fixture['all_planned_complete']=True
   (root/'docs/fixed-deployment-profile-certification.json').write_text(json.dumps(fixture))
   (root/'docs/deployment.md').write_text('# Deployment\n\n## Configuration\n')
   with patch.object(report,'ROOT',root):report.report()
   text=(root/'docs/fixed-deployment-profile-certification.md').read_text()
   self.assertIn('## Certified envelope matrix',text)
   self.assertIn('| Envelope | A | B | C |\n|---|---|---|---|\n| W1 single',text)
   self.assertIn('API-invalid',text)
   self.assertIn('Go 1.27.1',text)

class NegativeVerdictReportingTests(unittest.TestCase):
 def test_observed_pass_does_not_become_formal_certification(self):
  if not (analyze.WORK/'geometry'/'environment.json').exists():self.skipTest('no local observations')
  import json
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/'docs').mkdir()
   with patch.object(analyze,'ROOT',root),patch.object(analyze,'archive',lambda p:{'path':p.name,'test_only':True}):
    result=analyze.analyze()
   self.assertTrue(result['all_planned_complete'])
   self.assertEqual(result['certified_profile_ids'],[])
   for p in ['A','B','C']:
    observed=result['profiles'][p]['observed_gates']
    self.assertTrue(observed['fresh_first_request_numerical'])
    self.assertTrue(observed['concurrency_numerical_and_overlap'])
    self.assertTrue(observed['normal_async_numerical_and_overlap'])
    self.assertTrue(observed['sustained_async_numerical'])
    self.assertFalse(observed['sustained_async_numerical_and_overlap'])
    self.assertFalse(result['profiles'][p]['fresh_pass'])
    self.assertEqual(result['profiles'][p]['verdict'],'NOT CERTIFIED')
   self.assertTrue(result['profiles']['A']['observed_gates']['W1_single_numerical'])
   self.assertTrue(result['profiles']['B']['observed_gates']['W1_single_numerical'])
   self.assertFalse(result['profiles']['C']['observed_gates']['W1_single_numerical'])
   (root/'docs/deployment.md').write_text('# Deployment\n\n## Configuration\n')
   with patch.object(report,'ROOT',root):report.report()
   text=(root/'docs/fixed-deployment-profile-certification.md').read_text()
   self.assertNotIn('C certifies',text)
   self.assertIn('No candidate is certified.',text)
   self.assertIn('Observed gates (separate from formal certification)',text)
   self.assertEqual((root/'docs/deployment.md').read_text(),'# Deployment\n\n## Configuration\n')
