/**
 * Layer 3b — Expected goals calibration for probability & scoreline (V2).
 * Uses stat projection SoT/goals as base, refined with ratings, form, GK, finishing.
 * Does NOT alter shots, corners, saves, or cards (computed upstream).
 */
import { computeAttackIndex, computeDefenceIndex, round } from '../teamRatings.js';
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function ratingLambda(team, opponent, leagueAvg) {
    const attack = (team.power.attackRating ?? 50) / 50;
    const finishing = (team.power.finishingRating ?? 50) / 100;
    const form = 1 + ((team.power.currentFormRating ?? 50) - 50) / 180;
    const oppDef = (opponent.power.defenceRating ?? 50) / 50;
    const oppGk = (opponent.power.goalkeeperRating ?? 50) / 100;
    const suppression = clamp(0.72 + (oppDef + oppGk) * 0.22, 0.68, 1.28);
    return leagueAvg * attack * (1 + finishing * 0.25) * form / suppression;
}
export function calibrateExpectedGoals(model, home, away, statProjection) {
    const leagueAvg = model.tournamentGoalsPerTeam ?? 1.49;
    const notes = [];
    const displayHome = statProjection.expectedGoals.home;
    const displayAway = statProjection.expectedGoals.away;
    const homeSoT = statProjection.home.shotsOnTarget;
    const awaySoT = statProjection.away.shotsOnTarget;
    const baseHome = displayHome ?? 1.2;
    const baseAway = displayAway ?? 1.0;
    const ratingHome = ratingLambda(home, away, leagueAvg);
    const ratingAway = ratingLambda(away, home, leagueAvg);
    const homeAttackIdx = computeAttackIndex(home, model.weighting) ?? 50;
    const awayAttackIdx = computeAttackIndex(away, model.weighting) ?? 50;
    const homeDefIdx = computeDefenceIndex(home, model.weighting) ?? 50;
    const awayDefIdx = computeDefenceIndex(away, model.weighting) ?? 50;
    const homeSoTGoals = homeSoT != null
        ? homeSoT * clamp(0.09 + (home.power.finishingRating ?? 50) / 800, 0.08, 0.20)
            / clamp(0.75 + ((away.power.goalkeeperRating ?? 50) + (away.power.defenceRating ?? 50)) / 280, 0.7, 1.25)
        : null;
    const awaySoTGoals = awaySoT != null
        ? awaySoT * clamp(0.09 + (away.power.finishingRating ?? 50) / 800, 0.08, 0.20)
            / clamp(0.75 + ((home.power.goalkeeperRating ?? 50) + (home.power.defenceRating ?? 50)) / 280, 0.7, 1.25)
        : null;
    let homeLambda = baseHome * 0.50 + ratingHome * 0.25 + (homeSoTGoals ?? baseHome) * 0.25;
    let awayLambda = baseAway * 0.50 + ratingAway * 0.25 + (awaySoTGoals ?? baseAway) * 0.25;
    const homeTournament = home.tournamentAverages.goalsFor;
    const awayTournament = away.tournamentAverages.goalsAgainst;
    if (homeTournament != null && awayTournament != null) {
        const avgBlend = (homeTournament + awayTournament) / 2;
        homeLambda = homeLambda * 0.85 + avgBlend * 0.15;
    }
    const awayTournamentFor = away.tournamentAverages.goalsFor;
    const homeTournamentAgainst = home.tournamentAverages.goalsAgainst;
    if (awayTournamentFor != null && homeTournamentAgainst != null) {
        const avgBlend = (awayTournamentFor + homeTournamentAgainst) / 2;
        awayLambda = awayLambda * 0.85 + avgBlend * 0.15;
    }
    if ((homeAttackIdx - awayDefIdx) > 15) {
        homeLambda *= 1 + Math.min(0.08, (homeAttackIdx - awayDefIdx) / 400);
        notes.push('Home attack vs away defence edge applied');
    }
    if ((awayAttackIdx - homeDefIdx) > 15) {
        awayLambda *= 1 + Math.min(0.08, (awayAttackIdx - homeDefIdx) / 400);
        notes.push('Away attack vs home defence edge applied');
    }
    homeLambda = clamp(homeLambda, 0.10, 3.8);
    awayLambda = clamp(awayLambda, 0.08, 3.5);
    const xgDiff = homeLambda - awayLambda;
    notes.push(`Calibrated λ ${round(homeLambda, 2)}–${round(awayLambda, 2)} (display xG ${round(baseHome, 2)}–${round(baseAway, 2)})`);
    return {
        home: round(baseHome, 2),
        away: round(baseAway, 2),
        displayHome: round(baseHome, 2),
        displayAway: round(baseAway, 2),
        homeLambda: round(homeLambda, 3),
        awayLambda: round(awayLambda, 3),
        leagueAveragePerTeam: round(leagueAvg, 2),
        method: 'V2 calibration: 50% stat-projection goals + 25% rating lambda + 25% SoT conversion; display xG from stat layer',
        expectedGoalDifference: round(xgDiff, 2) ?? xgDiff,
        calibrationNotes: notes,
    };
}
