/**
 * Parse CLI team arguments for predict-match.
 * npm run predict-match -- "France" "Sweden"
 * => process.argv includes team names after the script path (post `--`).
 */
const SUBCOMMANDS = new Set(['match', 'knockout', 'predict-match']);
function stripQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}
function isScriptPath(arg) {
    return arg.endsWith('.ts') || arg.endsWith('.js') || arg.includes('prediction-engine');
}
function isOptionFlag(arg) {
    return arg === '--' || arg.startsWith('-');
}
/**
 * Collect positional CLI args: everything after the script path, excluding flags/subcommands.
 */
export function collectPositionalArgs(argv) {
    const raw = argv.slice(2).filter((arg) => arg !== '--');
    return raw
        .filter((arg) => !isScriptPath(arg) && !isOptionFlag(arg) && !SUBCOMMANDS.has(arg))
        .map(stripQuotes)
        .filter(Boolean);
}
export function parsePredictMatchArgs(argv) {
    const positional = collectPositionalArgs(argv);
    if (positional.length === 0) {
        throw new Error('Missing team names.\nUsage: npm run predict-match -- "<Team A>" "<Team B>"');
    }
    if (positional.length === 1) {
        throw new Error(`Only one team provided ("${positional[0]}").\nUsage: npm run predict-match -- "<Team A>" "<Team B>"`);
    }
    if (positional.length > 2) {
        throw new Error(`Expected exactly 2 team names, received ${positional.length}: ${positional.join(', ')}\n`
            + 'Usage: npm run predict-match -- "<Team A>" "<Team B>"');
    }
    return {
        teamA: positional[0],
        teamB: positional[1],
    };
}
export function isKnockoutCommand(argv) {
    const raw = argv.slice(2);
    return raw.includes('knockout');
}
