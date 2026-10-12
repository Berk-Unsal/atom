#!/usr/bin/env python3
"""Offline specification arithmetic only. No live limiter, clocks, IDs or RF calls."""
import datetime,json,math,pathlib
HERE=pathlib.Path(__file__).resolve().parent
JOURNEYS={'A':['evaluate'],'B':['optimize'],'C':['evaluate','interference'],'D':['evaluate','interference','evaluate'],'E':['evaluate','optimize'],'F':['evaluate','interference','evaluate','optimize'],'G':['optimize','explain'],'H1':['evaluate','evaluate'],'H2':['evaluate','interference','evaluate']*2,'H3':['evaluate','interference','evaluate','optimize']*2,'L3+inspection':['evaluate','interference','evaluate','optimize','explain'],'azimuth':['azimuth']}
def action(kind,n):
 if kind in ['evaluate','optimize']:return [('root',kind)]+[('map',f'{kind}-map-{i+1}') for i in range(n)]
 if kind=='azimuth':return [('root','azimuth'),('root','sector-refresh')]
 return [('root',kind)]
def count_journey(kinds,n):return sum(len(action(k,n)) for k in kinds)
def ledger(policy,kinds,n,flat=28):
 # A finite predeclared tape; this is not an implementation of authorization.
 used=extra_used=root_used=map_used=accepted=0;records=[];denied=None
 for kind in kinds:
  calls=action(kind,n);children=len(calls)-1
  if policy in ['P3-capped','P5-reserve20','P5-reserve28']:
   if policy=='P3-capped':
    granted=min(8-extra_used,children);required=1+children-granted;capacity=20
   else:granted=0;required=len(calls);capacity=20 if policy=='P5-reserve20' else 28
   if used+required>capacity:
    # A capacity failure is before root RF; its ordinary attempt stays charged
    # if the ordinary budget itself still had an available unit.
    charged=int(used<capacity);used+=charged;denied={'attempt':accepted+1,'action':kind,'stage':'root before RF','charged':charged};break
   used+=required;extra_used+=granted;accepted+=len(calls)
   records.append({'action':kind,'calls':len(calls),'ordinary_units':required,'verified_extra_units':granted,'post_complete_ordinary_remaining':capacity-used,'post_complete_extra_remaining':8-extra_used if policy=='P3-capped' else 0});continue
  for role,name in calls:
   if policy=='P2':cost=2 if role=='map' else 3;capacity=60;can=used+cost<=capacity
   elif policy=='P4':cost=1;capacity=24 if role=='map' else 20;can=(map_used if role=='map' else root_used)<capacity
   elif policy=='P3-naive':cost=0 if role=='map' else 1;capacity=20;can=used+cost<=capacity
   elif policy=='P6':cost=int(role=='root' and name not in ['sector-refresh']);capacity=20;can=used+cost<=capacity
   else:cost=1;capacity=20 if policy=='P0' else flat;can=used+cost<=capacity
   if not can:denied={'attempt':accepted+1,'action':kind,'stage':name,'charged':0};break
   used+=cost;root_used+=int(role=='root');map_used+=int(role=='map');accepted+=1
  if denied:break
  records.append({'action':kind,'calls':len(calls),'charged_units':sum(2 if role=='map' else 3 for role,_ in calls) if policy=='P2' else len(calls) if policy in ['P0','P1'] else None})
 return {'policy':policy,'cells':n,'planned_calls':count_journey(kinds,n),'accepted_RF_calls':accepted,'all_complete':denied is None,'first_denial':denied,'charged_units':used,'verified_extra_units':extra_used,'remaining':(20-used if policy in ['P0','P3-capped','P3-naive','P6','P5-reserve20'] else 60-used if policy=='P2' else 28-used if policy=='P5-reserve28' else flat-used if policy=='P1' else {'root':20-root_used,'map':24-map_used}),'actions':records}
def limits(policy,n):
 if policy in ['P0','P1','P5-reserve20','P5-reserve28']:
  b=20 if policy in ['P0','P5-reserve20'] else 28
  return {'Optimize':b,'Evaluate':b,'independent_Simulate':b,'complete_map_workflows':b//(n+1),'total_RF_admissions':b,'loose_two_window_bound':2*b,'tight_retained_anchored_boundary':2*b-1}
 if policy=='P2':return {'Optimize':20,'Evaluate':20,'independent_Simulate':30,'complete_map_workflows':60//(3+2*n),'total_RF_admissions':30,'loose_two_window_bound':60,'tight_map_boundary':59,'tight_root_boundary':39}
 if policy=='P4':return {'Optimize':20,'Evaluate':20,'independent_Simulate':24,'complete_map_workflows':min(20,24//n),'total_RF_admissions':44,'loose_two_window_bound':88,'tight_aligned_bucket_boundary':86}
 if policy in ['P3-naive','P6']:return {'Optimize':20,'Evaluate':20,'independent_Simulate':20,'complete_map_workflows':20,'total_RF_steps_fresh_no_hoard':20*(n+1),'loose_two_window_bound_no_hoard':40*(n+1),'carry_hazard':'without a shared executed/held cap, outstanding grants from older windows can amplify this bound'}
 return {'Optimize':20,'Evaluate':20,'independent_Simulate':20,'complete_map_workflows':28//(n+1),'fresh_verified_maps_in_full_workflows':n*(28//(n+1)),'fresh_max_maps_including_independent':28-math.ceil(8/n),'carried_maps_ceiling_in_current_window':28,'extra_RF_admissions':8,'total_RF_admissions':28,'loose_two_window_bound':56,'tight_retained_anchored_boundary':55,'ordinary_loose_boundary':40,'ordinary_tight_if_extra_anchors_window':40}
def generate():
 lock=json.loads((HERE/'evaluation-lock.json').read_text());assert lock['candidate_selection'] is None
 policies=['P0','P1','P2','P3-naive','P3-capped','P4','P5-reserve20','P5-reserve28','P6']
 rows=[dict(ledger(p,kinds,n),journey=name) for p in policies for n in [6,8] for name,kinds in JOURNEYS.items()]
 thresholds=[{'journey':name,'cells':n,'minimum_flat_budget':count_journey(kinds,n)} for name,kinds in JOURNEYS.items() for n in [6,8]]
 alternative_thresholds=[{'budget':b,'root_and_independent_map_delta':b-20,'percentage_delta':100*(b/20-1),'loose_boundary':2*b,'tight_boundary':2*b-1,'six_F':ledger('P1',JOURNEYS['F'],6,b)['all_complete'],'eight_F':ledger('P1',JOURNEYS['F'],8,b)['all_complete']} for b in [19,20,28,29,38,56]]
 value={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'offline closed-form finite event tapes; no production implementation or new RF evidence','assumptions':'fresh retained IP, one anchored window, successful valid RF, no concurrency conflict; shared tabs sequential unless stated; no timing estimate','journeys':JOURNEYS,'rows':rows,'threshold_derivation':thresholds,'flat_thresholds':alternative_thresholds,'abuse_envelopes':[dict(limits(p,n),policy=p,cells=n) for p in policies for n in [6,8]],'recommended_funding_invariants':['ordinary_spent + ordinary_held <=20','extra_spent + extra_held <=8','all currently admitted RF attempts <=28 in retained window','window reset clears spent counters only; held liabilities survive','claim atomically held--, matching spent++; never refund spent','only valid new slot progress can renew idle expiry; no renewal on invalid/replay/duplicates'], 'boundary_note':'loose bound2B; tight near-boundary bound2B−1 because an earlier charge anchors the window. Restart/eviction/IP churn are outside retained-state guarantees; concurrency further constrains actual throughput.'}
 (HERE/'simulations.json').write_text(json.dumps(value,indent=2)+'\n');print(len(rows),'journey rows')
if __name__=='__main__':generate()
