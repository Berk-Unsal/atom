import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from analyze import scientific_comparison
class ScientificIdentityTests(unittest.TestCase):
 def rows(self,canonical=False):
  return [{'profile_id':profile,'responses':[{'endpoint':'/api/building-entry-analysis','request_sha256':'fixture','status':200,'server_done':True,'sha256':profile+'-volatile',**({'scientific_sha256':'a'*64} if canonical else {})}]} for profile in ['A','B','C']]
 def test_volatile_raw_difference_with_complete_scientific_identity(self):
  value=scientific_comparison(self.rows(),self.rows(True),True)
  self.assertTrue(value['stable']);self.assertFalse(value['raw_response_hash_stability']['stable'])
 def test_missing_response_missing_hash_and_unfinished_batch_fail_closed(self):
  primary=self.rows();supp=self.rows(True)
  self.assertFalse(scientific_comparison(primary,supp[:-1],True)['stable'])
  del supp[0]['responses'][0]['scientific_sha256']
  self.assertFalse(scientific_comparison(primary,supp,True)['stable'])
  self.assertFalse(scientific_comparison(primary,self.rows(True),False)['stable'])
 def test_changed_scientific_value_or_fixture_cannot_pass(self):
  supp=self.rows(True);supp[0]['responses'][0]['scientific_sha256']='b'*64
  self.assertFalse(scientific_comparison(self.rows(),supp,True)['stable'])
  supp=self.rows(True);supp[0]['responses'][0]['request_sha256']='different'
  self.assertFalse(scientific_comparison(self.rows(),supp,True)['stable'])
if __name__=='__main__':unittest.main()
