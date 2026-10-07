import json,pathlib,unittest
from simulations import JOURNEYS,count_journey,ledger,limits
HERE=pathlib.Path(__file__).resolve().parent
class StudyArithmeticTests(unittest.TestCase):
 def test_actual_fanout_formulas(self):
  for n in [6,8]:
   self.assertEqual(count_journey(JOURNEYS['A'],n),n+1)
   self.assertEqual(count_journey(JOURNEYS['D'],n),2*n+3)
   self.assertEqual(count_journey(JOURNEYS['E'],n),2*n+2)
   self.assertEqual(count_journey(JOURNEYS['F'],n),3*n+4)
 def test_current_denial_positions(self):
  for n,index in [(6,'optimize-map-5'),(8,'optimize-map-1')]:
   row=ledger('P0',JOURNEYS['F'],n);self.assertEqual(row['first_denial']['attempt'],21);self.assertEqual(row['first_denial']['stage'],index)
 def test_minimum_extra_not_arbitrary(self):
  self.assertEqual(count_journey(JOURNEYS['F'],8)-20,8)
  self.assertFalse(ledger('P1',JOURNEYS['F'],8,27)['all_complete'])
  self.assertTrue(ledger('P1',JOURNEYS['F'],8,28)['all_complete'])
 def test_recommended_six_eight_funding(self):
  expected={6:{'A':(1,6),'D':(7,8),'E':(6,8),'F':(14,8),'G':(2,6)},8:{'A':(1,8),'D':(11,8),'E':(10,8),'F':(20,8),'G':(2,8)}}
  for n,cases in expected.items():
   for name,units in cases.items():
    row=ledger('P3-capped',JOURNEYS[name],n);self.assertTrue(row['all_complete']);self.assertEqual((row['charged_units'],row['verified_extra_units']),units)
 def test_bounded_not_infinite_extra(self):
  for n in [6,8]:
   row=ledger('P3-capped',JOURNEYS['H3'],n);self.assertFalse(row['all_complete']);self.assertLessEqual(row['charged_units'],20);self.assertLessEqual(row['verified_extra_units'],8);self.assertLessEqual(row['accepted_RF_calls'],28)
 def test_uninterrupted_action_is_atomic_budget_only(self):
  row=ledger('P3-capped',['independent']*19+['optimize'],8)
  #19 ordinary calls then root with8 extra: the complete9-call action fits.
  self.assertTrue(row['all_complete']);self.assertEqual(row['accepted_RF_calls'],28)
  row=ledger('P3-capped',['evaluate']+['independent']*18+['optimize'],8)
  self.assertFalse(row['all_complete']);self.assertEqual(row['first_denial']['stage'],'root before RF')
 def test_independent_calls_do_not_receive_extra(self):
  row=ledger('P3-capped',['independent']*21,8);self.assertEqual(row['accepted_RF_calls'],20);self.assertEqual(row['verified_extra_units'],0)
 def test_weighting_integer_derivation(self):
  #4 semantic roots and24 same-route maps;60 tokens at3/2 weights.
  self.assertEqual(4*3+24*2,60);self.assertEqual(limits('P2',8)['Optimize'],20);self.assertEqual(limits('P2',8)['independent_Simulate'],30)
 def test_anchored_boundary_includes_initial_charge(self):
  self.assertEqual(limits('P0',8)['tight_retained_anchored_boundary'],39)
  self.assertEqual(limits('P3-capped',8)['tight_retained_anchored_boundary'],55)
 def test_carry_reservation_algebra(self):
  for cap,held in [(20,16),(8,8)]:
   #Reset spent, retain held; claim transfers liability, not replenishment.
   before=cap-held;after=cap-1-(held-1);self.assertEqual(before,after)
 def test_client_and_ticket_logical_bounds(self):
  self.assertEqual(4096*(20+8),114688);self.assertEqual(114688*8*32,29360128)
 def test_frozen_selection_was_prospective(self):
  lock=json.loads((HERE/'evaluation-lock.json').read_text());s=json.loads((HERE/'simulations.json').read_text())
  self.assertIsNone(lock['candidate_selection']);self.assertLess(lock['frozen_at'],s['generated_at']);self.assertEqual(len(lock['criteria']),20)
 def test_inventory_all_19_current_routes(self):
  data=json.loads((HERE/'source-audit.json').read_text());self.assertEqual(len(data['routes']),19);self.assertTrue(all(q['method']=='POST' and q['current_attempt_cost']==1 and q['registrations'] for q in data['routes']))
if __name__=='__main__':unittest.main()
