| Feature | Real-World Problem Solved | Why It Fits A.T.O.M | Difficulty |
|---|---|---:|---:|
| **Multi-Tower Optimization** | Real networks are not planned one tower at a time; sectors overlap and interfere. | Extend current single-tower optimizer into coordinated tower scoring. | High |
| **New Site Recommendation** | Cities/operators need to decide where to place the next small cell or rooftop antenna. | Try candidate points on buildings/roads and score demand gained per site. | High |
| **Cost-Aware Planning** | The best RF location may be too expensive or impractical. | Add estimated install cost by rooftop height, road distance, fiber proximity, or site type. | Medium |
| **Emergency Coverage Mode** | During disasters/events, planners care about hospitals, schools, shelters, and roads first. | Reweight demand targets dynamically: hospital/university/school/major road priority. | Medium |
| **Fairness / Population Equity Score** | Networks often over-serve commercial cores and under-serve dense housing. | Use residential demand to report which neighborhoods are left behind. | Medium |
| **Field Measurement Calibration** | Simulation becomes more credible if it can ingest real RSSI/speed-test points. | Compare predicted Rx with measured Rx and tune wall-loss/demand weights. | High |
| **Indoor Coverage Risk** | 5G/6G indoor service is hard; wall penetration matters. | Current frequency-dependent penetration already supports this naturally. | Medium |
| **Backhaul Feasibility Layer** | A perfect antenna site is useless without fiber/microwave backhaul. | Add candidate-site penalties for distance to known roads/fiber/corridors. | Medium |
| **Planning Report Export** | Engineers need to justify decisions to teams, municipalities, or stakeholders. | Export selected tower, azimuth, stats, maps, and demand hits as PDF/Markdown. | Low-Medium |