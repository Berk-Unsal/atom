#!/usr/bin/env python3
"""Shipping explanation negative controls from actual retained RF metadata."""
import copy
import json
import pathlib
from transport import Transport, save

WORK = pathlib.Path('/audit/work')

def main():
    tr = Transport('shipping-explanation-cap')
    responses = []
    for n in [6, 7, 8]:
        cardinality = 6 if n == 6 else 8
        path = WORK / f'A-{cardinality}C-single-0/runs.jsonl'
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        row = next(q for q in rows if q['domain'] == 'dense-certification-1' and q['frequency_ghz'] == 2.6 and q['operation'] == 'explain' and q['capture'])
        result = json.loads((WORK / row['responses'][0]['captured_body']).read_text())
        recommended = result['optimization']['recommended_solution_id']
        solution = copy.deepcopy(next(s for s in result['pareto_frontier'] if s['id'] == recommended))
        baseline = copy.deepcopy(result['baseline'])
        baseline['cell_configurations'] = baseline['cell_configurations'][:n]
        solution['towers'] = solution['towers'][:n]
        fixture = json.loads((WORK / 'fixtures' / (row['fixture'] + '.json')).read_text())
        request = {'run_id': result['optimization_run_id'], 'solution_id': solution['id'], 'cell_id': fixture['network']['towers'][0]['id'], 'baseline': baseline, 'solution': solution, 'optimization': fixture['network']['optimization'], 'optimization_domain': result['optimization_domain']}
        response, body = tr.request('/api/explain-network-cell', request, tr.ip(), small=True)
        response.update({'input_cells': n, 'expected_status': 200 if n == 6 else 400, 'body': body.decode(), 'seven_cell_control_note': 'Seven real retained configurations; rejection occurs at baseline cardinality gate before retained run/domain identity validation' if n == 7 else None})
        responses.append(response)
    save(WORK / 'A-shipping-explanation-cap/cap-responses.json', responses)

if __name__ == '__main__':
    main()
