#!/usr/bin/env node
/**
 * EdgeStats local prediction engine — CLI entry point.
 *
 * Usage:
 *   npm run predict-match -- "France" "Sweden"
 *   npm run predict-knockout-round
 */
import { isKnockoutCommand, parsePredictMatchArgs } from './cliArgs.js';
import { loadMasterModel } from './loadData.js';
import { predictKnockoutRound, predictMatch } from './matchPredictor.js';
export { loadMasterModel } from './loadData.js';
export { predictMatch, predictKnockoutRound, buildKnockoutPairings } from './matchPredictor.js';
export { getKnockoutMatchList, getTeamFlag, findKnockoutFixture } from './knockoutFixtures.js';
export * from './types.js';
export { parsePredictMatchArgs } from './cliArgs.js';
function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function usage() {
    console.error('Usage:');
    console.error('  npm run predict-match -- "<Team A>" "<Team B>"');
    console.error('  npm run predict-knockout-round');
    process.exit(1);
}
async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h'))
        usage();
    const model = loadMasterModel();
    if (isKnockoutCommand(process.argv)) {
        const result = predictKnockoutRound(model);
        printJson(result);
        return;
    }
    const { teamA, teamB } = parsePredictMatchArgs(process.argv);
    const result = predictMatch(model, teamA, teamB);
    printJson(result);
}
main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
