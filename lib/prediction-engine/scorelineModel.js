import { computeAttackIndex, computeDefenceIndex, round, } from './teamRatings.js';
const MAX_GOALS = 6;
export function poissonProbability(lambda, k) {
    if (lambda <= 0)
        return k === 0 ? 1 : 0;
    return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}
function poisson(lambda, k) {
    return poissonProbability(lambda, k);
}
function factorial(n) {
    if (n <= 1)
        return 1;
    let result = 1;
    for (let i = 2; i <= n; i += 1)
        result *= i;
    return result;
}
function blendNullable(weights) {
    let total = 0;
    let weightSum = 0;
    for (const [value, weight] of weights) {
        if (value == null)
            continue;
        total += value * weight;
        weightSum += weight;
    }
    return weightSum > 0 ? total / weightSum : null;
}
export function computeExpectedGoals(model, home, away) {
    const leagueAveragePerTeam = model.tournamentGoalsPerTeam ?? 1.49;
    const homeAttack = computeAttackIndex(home, model.weighting);
    const awayAttack = computeAttackIndex(away, model.weighting);
    const homeDefence = computeDefenceIndex(home, model.weighting);
    const awayDefence = computeDefenceIndex(away, model.weighting);
    const ratingLambdaHome = leagueAveragePerTeam
        * ((homeAttack ?? 50) / 50)
        * (50 / (awayDefence ?? 50));
    const ratingLambdaAway = leagueAveragePerTeam
        * ((awayAttack ?? 50) / 50)
        * (50 / (homeDefence ?? 50));
    const homeXG = blendNullable([
        [ratingLambdaHome, 0.55],
        [home.tournamentAverages.xG, 0.25],
        [home.tournamentAverages.goalsFor, 0.20],
    ]);
    const awayXG = blendNullable([
        [ratingLambdaAway, 0.55],
        [away.tournamentAverages.xG, 0.25],
        [away.tournamentAverages.goalsFor, 0.20],
    ]);
    let adjustedHome = homeXG ?? ratingLambdaHome;
    let adjustedAway = awayXG ?? ratingLambdaAway;
    if (home.finishingEfficiency != null && home.finishingEfficiency > 0) {
        adjustedHome *= Math.min(1.25, Math.max(0.75, 0.85 + home.finishingEfficiency * 0.1));
    }
    if (away.finishingEfficiency != null && away.finishingEfficiency > 0) {
        adjustedAway *= Math.min(1.25, Math.max(0.75, 0.85 + away.finishingEfficiency * 0.1));
    }
    adjustedHome = Math.max(0.15, Math.min(3.8, adjustedHome));
    adjustedAway = Math.max(0.15, Math.min(3.8, adjustedAway));
    return {
        home: round(adjustedHome, 2),
        away: round(adjustedAway, 2),
        homeLambda: round(adjustedHome, 3),
        awayLambda: round(adjustedAway, 3),
        leagueAveragePerTeam: round(leagueAveragePerTeam, 2),
        method: 'Poisson xG blend: 55% EdgeStats attack/defence ratings, 25% tournament xG, 20% goals/match',
    };
}
export function computeOutcomeProbabilities(homeLambda, awayLambda) {
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
        for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
            const prob = poisson(homeLambda, homeGoals) * poisson(awayLambda, awayGoals);
            if (homeGoals > awayGoals)
                homeWin += prob;
            else if (homeGoals === awayGoals)
                draw += prob;
            else
                awayWin += prob;
        }
    }
    const total = homeWin + draw + awayWin;
    if (total <= 0) {
        return { homeWin: 0.33, draw: 0.34, awayWin: 0.33 };
    }
    return {
        homeWin: round(homeWin / total, 4) ?? 0,
        draw: round(draw / total, 4) ?? 0,
        awayWin: round(awayWin / total, 4) ?? 0,
    };
}
export function getTopPoissonScorelines(homeLambda, awayLambda, limit = 10) {
    const scores = [];
    for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
        for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
            const prob = poisson(homeLambda, homeGoals) * poisson(awayLambda, awayGoals);
            scores.push({
                home: homeGoals,
                away: awayGoals,
                label: `${homeGoals}-${awayGoals}`,
                probability: prob,
            });
        }
    }
    scores.sort((a, b) => b.probability - a.probability);
    return scores.slice(0, limit).map((row) => ({
        ...row,
        probability: round(row.probability, 4) ?? row.probability,
    }));
}
export function pickMostLikelyScoreline(homeLambda, awayLambda) {
    let bestHome = 0;
    let bestAway = 0;
    let bestProb = -1;
    for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
        for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
            const prob = poisson(homeLambda, homeGoals) * poisson(awayLambda, awayGoals);
            if (prob > bestProb) {
                bestProb = prob;
                bestHome = homeGoals;
                bestAway = awayGoals;
            }
        }
    }
    return {
        home: bestHome,
        away: bestAway,
        label: `${bestHome}-${bestAway}`,
        probability: round(bestProb, 4),
    };
}
export function determineWinner(homeTeam, awayTeam, scoreline, probabilities) {
    if (scoreline.home > scoreline.away)
        return homeTeam;
    if (scoreline.away > scoreline.home)
        return awayTeam;
    if (probabilities.homeWin >= probabilities.awayWin)
        return homeTeam;
    if (probabilities.awayWin > probabilities.homeWin)
        return awayTeam;
    return 'Draw';
}
export function projectCorners(home, away) {
    const homeBase = home.cornerTrends.averageCornersFor ?? home.tournamentAverages.cornersFor;
    const awayBase = away.cornerTrends.averageCornersFor ?? away.tournamentAverages.cornersFor;
    if (homeBase == null && awayBase == null) {
        return { [home.team]: null, [away.team]: null };
    }
    const homeStrength = home.cornerTrends.projectedRound2CornerStrength ?? home.power.cornerRating ?? 50;
    const awayStrength = away.cornerTrends.projectedRound2CornerStrength ?? away.power.cornerRating ?? 50;
    const strengthDelta = (homeStrength - awayStrength) / 100;
    const homeCorners = homeBase != null
        ? Math.max(0, Math.round(homeBase * (1 + strengthDelta * 0.35)))
        : null;
    const awayCorners = awayBase != null
        ? Math.max(0, Math.round(awayBase * (1 - strengthDelta * 0.35)))
        : null;
    return {
        [home.team]: homeCorners,
        [away.team]: awayCorners,
    };
}
export function projectCards(model, home, away) {
    const homeRisk = home.cardTrends.projectedRound2CardRisk;
    const awayRisk = away.cardTrends.projectedRound2CardRisk;
    if (homeRisk == null && awayRisk == null) {
        return { total: null, home: null, away: null };
    }
    const factor = model.lowCardFactor;
    const homeAdj = homeRisk != null ? homeRisk * factor : null;
    const awayAdj = awayRisk != null ? awayRisk * factor : null;
    const total = homeAdj != null || awayAdj != null
        ? Math.max(0, Math.round((homeAdj ?? 0) + (awayAdj ?? 0)))
        : null;
    return {
        total,
        home: homeAdj != null ? round(homeAdj, 2) : null,
        away: awayAdj != null ? round(awayAdj, 2) : null,
    };
}
export function projectExpectedShots(home, away) {
    const homeBase = home.tournamentAverages.shots;
    const awayBase = away.tournamentAverages.shots;
    const homeSoT = home.tournamentAverages.shotsOnTarget;
    const awaySoT = away.tournamentAverages.shotsOnTarget;
    const homeAttack = home.power.attackRating ?? 50;
    const awayAttack = away.power.attackRating ?? 50;
    return {
        [home.team]: {
            total: homeBase != null
                ? Math.max(0, Math.round(homeBase * (1 + (homeAttack - awayAttack) / 200)))
                : null,
            onTarget: homeSoT != null
                ? Math.max(0, Math.round(homeSoT * (1 + (homeAttack - awayAttack) / 200)))
                : null,
        },
        [away.team]: {
            total: awayBase != null
                ? Math.max(0, Math.round(awayBase * (1 + (awayAttack - homeAttack) / 200)))
                : null,
            onTarget: awaySoT != null
                ? Math.max(0, Math.round(awaySoT * (1 + (awayAttack - homeAttack) / 200)))
                : null,
        },
    };
}
export function projectGoalkeeperSaves(home, away, expectedGoals) {
    const homeGk = home.primaryGoalkeeper;
    const awayGk = away.primaryGoalkeeper;
    const awayShotsOnTarget = away.tournamentAverages.shotsOnTarget;
    const homeShotsOnTarget = home.tournamentAverages.shotsOnTarget;
    const homeSaves = estimateSaves(homeGk, awayShotsOnTarget, expectedGoals.away, away.finishingEfficiency);
    const awaySaves = estimateSaves(awayGk, homeShotsOnTarget, expectedGoals.home, home.finishingEfficiency);
    return {
        [`${home.team}GK`]: homeSaves,
        [`${away.team}GK`]: awaySaves,
    };
}
function estimateSaves(keeper, opponentShotsOnTarget, opponentExpectedGoals, opponentFinishingEfficiency) {
    if (keeper?.savesPerMatch != null) {
        const base = keeper.savesPerMatch;
        const shotPressure = opponentShotsOnTarget != null
            ? opponentShotsOnTarget / 5
            : opponentExpectedGoals != null
                ? opponentExpectedGoals * 1.35
                : 1;
        const finishingFactor = opponentFinishingEfficiency != null
            ? Math.max(0.75, Math.min(1.2, 1.1 - opponentFinishingEfficiency * 0.05))
            : 1;
        return Math.max(0, Math.round(base * shotPressure * finishingFactor));
    }
    if (opponentShotsOnTarget != null) {
        const saveRate = keeper?.saveRate ?? 0.7;
        return Math.max(0, Math.round(opponentShotsOnTarget * saveRate));
    }
    return null;
}
