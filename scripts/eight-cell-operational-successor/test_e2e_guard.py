import copy
import unittest
from e2e_guard import REQUIRED,verify_execution
class GuardTests(unittest.TestCase):
 def fixture(self):
  file,title=REQUIRED['rf_budget_e2e']
  return {'suites':[{'specs':[{'id':'actual-test-id','file':file,'title':title,'tests':[{'projectName':'desktop-1440','expectedStatus':'passed','status':'expected','results':[{'status':'passed','startTime':'2026-10-07T00:00:00Z','duration':1200}]}]}]}],'stats':{'expected':1,'unexpected':0,'skipped':0,'flaky':0}}
 def test_executed_pass(self): self.assertTrue(verify_execution('rf_budget_e2e',self.fixture(),{'ATOM_REAL_E2E':'1'})['passed'])
 def test_skip_zero_exit(self):
  d=self.fixture();d['suites'][0]['specs'][0]['tests'][0]['results'][0]['status']='skipped'
  with self.assertRaises(ValueError):verify_execution('rf_budget_e2e',d,{'ATOM_REAL_E2E':'1'},0)
 def test_zero_tests(self):
  d=self.fixture();d['suites']=[]
  with self.assertRaises(ValueError):verify_execution('rf_budget_e2e',d,{'ATOM_REAL_E2E':'1'})
 def test_missing_opt_in(self):
  with self.assertRaises(ValueError):verify_execution('rf_budget_e2e',self.fixture(),{})
 def test_wrong_name_or_project(self):
  for key,value in [('title','other'),('file','other.spec.js')]:
   d=self.fixture();d['suites'][0]['specs'][0][key]=value
   with self.assertRaises(ValueError):verify_execution('rf_budget_e2e',d,{'ATOM_REAL_E2E':'1'})
 def test_failed(self):
  d=self.fixture();d['suites'][0]['specs'][0]['tests'][0]['results'][0]['status']='failed'
  with self.assertRaises(ValueError):verify_execution('rf_budget_e2e',d,{'ATOM_REAL_E2E':'1'})
if __name__=='__main__':unittest.main()
