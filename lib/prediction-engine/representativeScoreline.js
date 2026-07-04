/**
 * Representative scoreline selection — picks a score that reflects match profile,
 * not just the single highest Poisson exact-score probability.
 */
import { round } from './teamRatings.js';
import { getTopPoissonScorelines, pickMostLikelyScoreline, poissonProbability } from './scorelineModel.js';
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function label(home, away) {
    return `${home}-${away}`;
}
function uniqueCandidates(candidates) {
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
        const key = label(c.home, c.away);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ ...c, label: key });
    }
    return out;
}
/** Base goal band from xG thresholds. */
export function goalBandFromXG(xG) {
    if (xG < 0.45)
        return 0;
    if (xG < 1.25)
        return 1;
    if (xG < 2.05)
        return 2;
    if (xG < 2.85)
        return 3;
    return 4;
}
function adjustedGoalBand(xG, sot, finishingRating, oppGkRating, winProb) {
    let band = goalBandFromXG(xG);
    if (sot != null && sot >= 5 && (finishingRating ?? 50) >= 55) {
        band = Math.min(4, band + 1);
    }
    if (sot != null && sot <= 2) {
        band = Math.max(0, band - 1);
    }
    if ((oppGkRating ?? 50) >= 60) {
        band = Math.max(0, band - 1);
    }
    if (winProb >= 0.65 && xG >= 1.5) {
        band = Math.max(band, 2);
    }
    return clamp(band, 0, 4);
}
function outcomeOf(home, away) {
    if (home > away)
        return 'home';
    if (away > home)
        return 'away';
    return 'draw';
}
function poissonProb(homeLambda, awayLambda, home, away) {
    return poissonProbability(homeLambda, home) * poissonProbability(awayLambda, away);
}
function fitWinProbability(candidate, probabilities) {
    const outcome = outcomeOf(candidate.home, candidate.away);
    const matchProb = outcome === 'home'
        ? probabilities.homeWin
        : outcome === 'away'
            ? probabilities.awayWin
            : probabilities.draw;
    const margin = Math.abs(candidate.home - candidate.away);
    const favWin = Math.max(probabilities.homeWin, probabilities.awayWin);
    const dominance = favWin >= 0.65 ? Math.min(margin / 2, 1) : Math.min(margin / 3, 0.5);
    return matchProb * (1 + dominance * 0.15);
}
function fitToXG(candidate, homeXG, awayXG) {
    const homeDist = Math.abs(candidate.home - homeXG);
    const awayDist = Math.abs(candidate.away - awayXG);
    const avgDist = (homeDist + awayDist) / 2;
    return Math.max(0, 1 - avgDist / 2.5);
}
function fitToShotVolume(candidate, homeShots, awayShots, home, away) {
    if (homeShots == null || awayShots == null)
        return 0.5;
    const shotDiff = homeShots - awayShots;
    const goalDiff = candidate.home - candidate.away;
    const expectedSign = Math.sign(shotDiff);
    const actualSign = Math.sign(goalDiff);
    let score = 0.5;
    if (expectedSign === actualSign && expectedSign !== 0)
        score += 0.35;
    if (expectedSign === 0 && actualSign === 0)
        score += 0.25;
    const shotMag = Math.abs(shotDiff);
    if (shotMag >= 8 && Math.abs(goalDiff) >= 2 && actualSign === expectedSign)
        score += 0.2;
    if (shotMag >= 11) {
        if (shotDiff > 0 && candidate.home >= 2)
            score += 0.1;
        if (shotDiff < 0 && candidate.away >= 2)
            score += 0.1;
    }
    return clamp(score, 0, 1);
}
function fitToDefensiveProfile(candidate, homeXG, awayXG, homeSoT, awaySoT) {
    let score = 0.5;
    if (awayXG <= 0.7 && (homeSoT == null || awaySoT == null || awaySoT <= 2) && candidate.away === 0) {
        score += 0.45;
    }
    if (homeXG <= 0.7 && (homeSoT == null || homeSoT <= 2) && candidate.home === 0) {
        score += 0.45;
    }
    if (awayXG <= 0.5 && candidate.away === 0)
        score += 0.15;
    if (homeXG <= 0.5 && candidate.home === 0)
        score += 0.15;
    return clamp(score, 0, 1);
}
function fitToGoalkeeperProjection(candidate, homeSaves, awaySaves, homeSoT, awaySoT) {
    let score = 0.5;
    if (awaySaves != null && homeSoT != null && candidate.home > 0) {
        const expectedSaves = homeSoT - candidate.home;
        const saveDist = Math.abs(awaySaves - expectedSaves);
        score += Math.max(0, 0.35 - saveDist * 0.12);
    }
    if (homeSaves != null && awaySoT != null && candidate.away > 0) {
        const expectedSaves = awaySoT - candidate.away;
        const saveDist = Math.abs(homeSaves - expectedSaves);
        score += Math.max(0, 0.35 - saveDist * 0.12);
    }
    return clamp(score, 0, 1);
}
function fitToCleanSheet(candidate, homeXG, awayXG, homeSoT, awaySoT) {
    let score = 0.5;
    if (awayXG <= 0.7 && (awaySoT ?? 99) <= 2 && candidate.away === 0)
        score += 0.4;
    if (homeXG <= 0.7 && (homeSoT ?? 99) <= 2 && candidate.home === 0)
        score += 0.4;
    return clamp(score, 0, 1);
}
function fitToShotsOnTarget(candidate, homeSoT, awaySoT) {
    if (homeSoT == null || awaySoT == null)
        return 0.5;
    const expectedHome = Math.max(0, Math.round(homeSoT * 0.22));
    const expectedAway = Math.max(0, Math.round(awaySoT * 0.22));
    const homeDist = Math.abs(candidate.home - expectedHome);
    const awayDist = Math.abs(candidate.away - expectedAway);
    return clamp(1 - (homeDist + awayDist) / 4, 0, 1);
}
function fitToAttackingDominance(candidate, input) {
    const dominance = input.dominanceIndex ?? 0;
    const xgDiff = input.expectedGoalDifference ?? (input.homeXG - input.awayXG);
    const favIsHome = xgDiff >= 0;
    const margin = candidate.home - candidate.away;
    const favMargin = favIsHome ? margin : -margin;
    if (dominance < 0.45)
        return 0.5;
    if (favMargin >= 2 && dominance >= 0.55)
        return 0.9;
    if (favMargin === 1 && dominance >= 0.65)
        return 0.35;
    if (favMargin >= 2)
        return 0.75;
    return 0.55;
}
function scoreCandidate(candidate, input, topPoissonProb) {
    const rawPoisson = poissonProb(input.homeLambda, input.awayLambda, candidate.home, candidate.away);
    const poissonWeight = topPoissonProb > 0 ? rawPoisson / topPoissonProb : rawPoisson;
    const winFit = fitWinProbability(candidate, input.probabilities);
    const xgFit = fitToXG(candidate, input.homeXG, input.awayXG);
    const shotFit = fitToShotVolume(candidate, input.homeShots, input.awayShots, input.home, input.away);
    const defFit = fitToDefensiveProfile(candidate, input.homeXG, input.awayXG, input.homeSoT, input.awaySoT);
    const gkFit = fitToGoalkeeperProjection(candidate, input.homeSaves, input.awaySaves, input.homeSoT, input.awaySoT);
    const csFit = fitToCleanSheet(candidate, input.homeXG, input.awayXG, input.homeSoT, input.awaySoT);
    const sotFit = fitToShotsOnTarget(candidate, input.homeSoT, input.awaySoT);
    const domFit = fitToAttackingDominance(candidate, input);
    const totalScore = (poissonWeight * 0.16
        + winFit * 0.20
        + xgFit * 0.18
        + shotFit * 0.12
        + sotFit * 0.08
        + defFit * 0.08
        + gkFit * 0.06
        + csFit * 0.06
        + domFit * 0.06);
    return {
        label: candidate.label,
        home: candidate.home,
        away: candidate.away,
        source: candidate.source,
        totalScore: round(totalScore, 4) ?? totalScore,
        poissonProbability: round(rawPoisson, 4) ?? rawPoisson,
        fitToWinProbability: round(winFit, 4) ?? winFit,
        fitToXG: round(xgFit, 4) ?? xgFit,
        fitToShotVolume: round(shotFit, 4) ?? shotFit,
        fitToShotsOnTarget: round(sotFit, 4) ?? sotFit,
        fitToDefensiveProfile: round(defFit, 4) ?? defFit,
        fitToGoalkeeperProjection: round(gkFit, 4) ?? gkFit,
        fitToCleanSheetProbability: round(csFit, 4) ?? csFit,
        fitToAttackingDominance: round(domFit, 4) ?? domFit,
    };
}
function buildDominanceCandidate(input) {
    const favIsHome = input.probabilities.homeWin >= input.probabilities.awayWin;
    const favWin = favIsHome ? input.probabilities.homeWin : input.probabilities.awayWin;
    const favXG = favIsHome ? input.homeXG : input.awayXG;
    const underXG = favIsHome ? input.awayXG : input.homeXG;
    const favShots = favIsHome ? input.homeShots : input.awayShots;
    const underShots = favIsHome ? input.awayShots : input.homeShots;
    const underSoT = favIsHome ? input.awaySoT : input.homeSoT;
    if (favWin < 0.65)
        return null;
    if (favXG - underXG < 0.9)
        return null;
    if ((favShots ?? 0) - (underShots ?? 0) <= 6)
        return null;
    if (underXG > 0.7)
        return null;
    if ((underSoT ?? 99) > 2)
        return null;
    const favProfile = favIsHome ? input.home : input.away;
    const underProfile = favIsHome ? input.away : input.home;
    const oppGk = underProfile.primaryGoalkeeper?.projectedRound2SaveStrength
        ?? underProfile.power.goalkeeperRating;
    let favGoals = adjustedGoalBand(favXG, favIsHome ? input.homeSoT : input.awaySoT, favProfile.power.finishingRating, oppGk, favWin);
    if (favGoals < 2 && favXG >= 1.5 && (favShots ?? 0) >= 15) {
        favGoals = 2;
    }
    let underGoals = 0;
    if (underXG >= 0.45 && (underSoT ?? 0) > 2) {
        underGoals = 1;
    }
    const home = favIsHome ? favGoals : underGoals;
    const away = favIsHome ? underGoals : favGoals;
    return { home, away, label: label(home, away), source: 'dominance-adjusted' };
}
function buildCleanSheetCandidate(input) {
    const favIsHome = input.probabilities.homeWin >= input.probabilities.awayWin;
    const favWin = favIsHome ? input.probabilities.homeWin : input.probabilities.awayWin;
    const favXG = favIsHome ? input.homeXG : input.awayXG;
    const underXG = favIsHome ? input.awayXG : input.homeXG;
    const underSoT = favIsHome ? input.awaySoT : input.homeSoT;
    const favShots = favIsHome ? input.homeShots : input.awayShots;
    const cleanSheetLikely = underXG <= 0.7 && (underSoT ?? 99) <= 2;
    if (!cleanSheetLikely)
        return null;
    let favGoals = goalBandFromXG(favXG);
    if (favWin >= 0.65 && favXG >= 1.5 && (favShots ?? 0) >= 15) {
        favGoals = Math.max(favGoals, 2);
    }
    else if (favXG >= 1.25) {
        favGoals = Math.max(favGoals, 2);
    }
    else {
        favGoals = Math.max(favGoals, 1);
    }
    const home = favIsHome ? favGoals : 0;
    const away = favIsHome ? 0 : favGoals;
    return { home, away, label: label(home, away), source: 'clean-sheet-adjusted' };
}
function buildShotVolumeCandidate(input) {
    const favIsHome = input.probabilities.homeWin >= input.probabilities.awayWin;
    const favShots = favIsHome ? input.homeShots : input.awayShots;
    const favXG = favIsHome ? input.homeXG : input.awayXG;
    const underXG = favIsHome ? input.awayXG : input.homeXG;
    if ((favShots ?? 0) < 15 || favXG < 1.4)
        return null;
    const favGoals = Math.max(2, goalBandFromXG(favXG));
    const underGoals = underXG >= 0.55 ? 1 : 0;
    const home = favIsHome ? favGoals : underGoals;
    const away = favIsHome ? underGoals : favGoals;
    return { home, away, label: label(home, away), source: 'shot-volume-adjusted' };
}
function buildUnderdogScorerCandidate(input) {
    const favIsHome = input.probabilities.homeWin >= input.probabilities.awayWin;
    const favWin = favIsHome ? input.probabilities.homeWin : input.probabilities.awayWin;
    if (favWin < 0.55)
        return null;
    const underProfile = favIsHome ? input.away : input.home;
    const favProfile = favIsHome ? input.home : input.away;
    const underAttack = underProfile.power.attackRating ?? 50;
    const underGk = underProfile.power.goalkeeperRating ?? 50;
    const underForm = underProfile.power.currentFormRating ?? 50;
    const favDef = favProfile.power.defenceRating ?? 50;
    const strongUnderdog = underAttack >= 58 || underGk >= 62 || underForm >= 75;
    if (!strongUnderdog)
        return null;
    const favXG = favIsHome ? input.homeXG : input.awayXG;
    const underXG = favIsHome ? input.awayXG : input.homeXG;
    if (favXG - underXG < 0.5)
        return null;
    let favGoals = Math.max(2, goalBandFromXG(favXG));
    if (favDef >= 58 && underAttack >= 60)
        favGoals = Math.min(favGoals, 2);
    const underGoals = underXG >= 0.4 || underAttack >= 58 ? 1 : 0;
    const home = favIsHome ? favGoals : underGoals;
    const away = favIsHome ? underGoals : favGoals;
    if (underGoals === 0)
        return null;
    return { home, away, label: label(home, away), source: 'underdog-scorer-adjusted' };
}
function buildMultiGoalDominanceCandidates(input) {
    const dom = input.dominanceIndex ?? 0;
    const xgDiff = Math.abs(input.expectedGoalDifference ?? (input.homeXG - input.awayXG));
    const favIsHome = (input.expectedGoalDifference ?? (input.homeXG - input.awayXG)) >= 0;
    const favWin = favIsHome ? input.probabilities.homeWin : input.probabilities.awayWin;
    if (favWin < 0.65 || xgDiff < 0.9 || dom < 0.5)
        return [];
    const favGoals = favIsHome ? input.homeXG : input.awayXG;
    const out = [];
    if (favGoals >= 1.8) {
        const g2 = favIsHome ? { home: 2, away: 0 } : { home: 0, away: 2 };
        out.push({ ...g2, label: label(g2.home, g2.away), source: 'multi-goal-dominance' });
    }
    if (favGoals >= 2.2 && dom >= 0.65) {
        const g3 = favIsHome ? { home: 3, away: 0 } : { home: 0, away: 3 };
        out.push({ ...g3, label: label(g3.home, g3.away), source: 'multi-goal-dominance' });
        const g31 = favIsHome ? { home: 3, away: 1 } : { home: 1, away: 3 };
        out.push({ ...g31, label: label(g31.home, g31.away), source: 'multi-goal-dominance' });
    }
    return out;
}
function buildDrawCandidate(input) {
    const winDiff = Math.abs(input.probabilities.homeWin - input.probabilities.awayWin);
    const xgDiff = Math.abs(input.homeXG - input.awayXG);
    if (winDiff > 0.10 || xgDiff > 0.4)
        return null;
    const homeGoals = Math.max(1, Math.round(input.homeXG));
    const awayGoals = Math.max(1, Math.round(input.awayXG));
    const drawGoals = Math.max(homeGoals, awayGoals, 1);
    return {
        home: drawGoals,
        away: drawGoals,
        label: label(drawGoals, drawGoals),
        source: 'draw-adjusted',
    };
}
function buildRoundedXGCandidate(input) {
    const home = clamp(Math.round(input.homeXG), 0, 4);
    const away = clamp(Math.round(input.awayXG), 0, 4);
    return { home, away, label: label(home, away), source: 'rounded-xG' };
}
function buildSelectionReason(selected, input, flags, homeName, awayName) {
    const favIsHome = input.probabilities.homeWin >= input.probabilities.awayWin;
    const favName = favIsHome ? homeName : awayName;
    const underName = favIsHome ? awayName : homeName;
    const favWin = Math.round(Math.max(input.probabilities.homeWin, input.probabilities.awayWin) * 100);
    const xgAdv = round(Math.abs(input.homeXG - input.awayXG), 2);
    const shotAdv = Math.abs((input.homeShots ?? 0) - (input.awayShots ?? 0));
    if (flags.drawRuleApplied && selected.home === selected.away) {
        return `Representative score selected because win probabilities are within 10% and xG difference is ≤0.4 — a draw (${selected.label}) best reflects the balanced match profile.`;
    }
    if (flags.underdogGoalRuleApplied && selected.source === 'underdog-scorer-adjusted') {
        return `Representative score ${selected.label} — underdog attack/GK/form supports a consolation goal over a clean-sheet shutout.`;
    }
    if (flags.dominanceRuleApplied && selected.source === 'dominance-adjusted') {
        return `Representative score selected because ${favName} had ${favWin}% win probability, +${xgAdv} xG advantage, +${shotAdv} shot advantage and ${underName} xG below 0.7.`;
    }
    if (flags.cleanSheetRuleApplied && (selected.home === 0 || selected.away === 0)) {
        return `Representative score selected because the opponent projected ≤0.7 xG and ≤2 shots on target — a clean sheet for the favourite is strongly supported (${selected.label}).`;
    }
    if (flags.upsetRuleApplied) {
        return `Representative score kept close because the underdog has ≥25% win probability — ${selected.label} reflects competitive balance without overstating favourite dominance.`;
    }
    if (selected.source === 'shot-volume-adjusted') {
        return `Representative score selected because the favourite's high shot volume (≥15) and xG ≥1.4 support a multi-goal winning margin (${selected.label}).`;
    }
    if (selected.source === 'rounded-xG') {
        return `Representative score rounded from expected goals (${round(input.homeXG, 2)}–${round(input.awayXG, 2)} xG) to ${selected.label}, weighted against Poisson probabilities and match stats.`;
    }
    if (selected.poissonProbability >= 0.08) {
        return `Representative score ${selected.label} aligns with Poisson mass, win probabilities, and projected xG/shots — selected over the raw 1-goal default.`;
    }
    return `Representative score ${selected.label} selected as the best fit to win probability, xG, shot volume, defensive profile and goalkeeper projections.`;
}
export function selectRepresentativeScoreline(input) {
    const rawPoisson = pickMostLikelyScoreline(input.homeLambda, input.awayLambda);
    const topPoisson = getTopPoissonScorelines(input.homeLambda, input.awayLambda, 20);
    const topPoissonProb = topPoisson[0]?.probability ?? rawPoisson.probability ?? 0.01;
    const goalBandHome = adjustedGoalBand(input.homeXG, input.homeSoT, input.home.power.finishingRating, input.away.power.goalkeeperRating, input.probabilities.homeWin);
    const goalBandAway = adjustedGoalBand(input.awayXG, input.awaySoT, input.away.power.finishingRating, input.home.power.goalkeeperRating, input.probabilities.awayWin);
    const dominanceCandidate = buildDominanceCandidate(input);
    const cleanSheetCandidate = buildCleanSheetCandidate(input);
    const shotVolumeCandidate = buildShotVolumeCandidate(input);
    const drawCandidate = buildDrawCandidate(input);
    const roundedXG = buildRoundedXGCandidate(input);
    const goalBandHomeCandidate = {
        home: goalBandHome,
        away: goalBandAway,
        label: label(goalBandHome, goalBandAway),
        source: 'goal-band',
    };
    const underdogCandidate = buildUnderdogScorerCandidate(input);
    const multiGoalCandidates = buildMultiGoalDominanceCandidates(input);
    const candidates = uniqueCandidates([
        ...topPoisson.map((s) => ({ ...s, source: 'poisson-top' })),
        roundedXG,
        goalBandHomeCandidate,
        ...(dominanceCandidate ? [dominanceCandidate] : []),
        ...(cleanSheetCandidate ? [cleanSheetCandidate] : []),
        ...(shotVolumeCandidate ? [shotVolumeCandidate] : []),
        ...(drawCandidate ? [drawCandidate] : []),
        ...(underdogCandidate ? [underdogCandidate] : []),
        ...multiGoalCandidates,
    ]);
    const winDiff = Math.abs(input.probabilities.homeWin - input.probabilities.awayWin);
    const xgDiff = Math.abs(input.homeXG - input.awayXG);
    const underdogWin = Math.min(input.probabilities.homeWin, input.probabilities.awayWin);
    const drawRuleApplied = winDiff <= 0.10 && xgDiff <= 0.4;
    const dominanceRuleApplied = dominanceCandidate != null;
    const cleanSheetRuleApplied = cleanSheetCandidate != null
        || (input.homeXG <= 0.7 && (input.homeSoT ?? 99) <= 2)
        || (input.awayXG <= 0.7 && (input.awaySoT ?? 99) <= 2);
    const upsetRuleApplied = underdogWin >= 0.25;
    const underdogGoalRuleApplied = underdogCandidate != null;
    let scored = candidates.map((c) => scoreCandidate(c, input, topPoissonProb));
    if (drawRuleApplied) {
        scored = scored.map((s) => {
            if (s.home === s.away) {
                return { ...s, totalScore: (s.totalScore ?? 0) + 0.12 };
            }
            return s;
        });
    }
    if (dominanceRuleApplied && dominanceCandidate) {
        const domLabel = dominanceCandidate.label;
        scored = scored.map((s) => {
            if (s.label === domLabel) {
                return { ...s, totalScore: (s.totalScore ?? 0) + 0.15 };
            }
            if (s.label === rawPoisson.label && rawPoisson.home - rawPoisson.away === 1) {
                return { ...s, totalScore: (s.totalScore ?? 0) - 0.08 };
            }
            return s;
        });
    }
    if (cleanSheetRuleApplied && cleanSheetCandidate) {
        const csLabel = cleanSheetCandidate.label;
        scored = scored.map((s) => {
            if (s.label === csLabel) {
                return { ...s, totalScore: (s.totalScore ?? 0) + 0.10 };
            }
            return s;
        });
    }
    if (upsetRuleApplied) {
        scored = scored.map((s) => {
            const margin = Math.abs(s.home - s.away);
            if (margin >= 3) {
                return { ...s, totalScore: (s.totalScore ?? 0) - 0.20 };
            }
            if (margin === 2 && underdogWin >= 0.30) {
                return { ...s, totalScore: (s.totalScore ?? 0) - 0.06 };
            }
            return s;
        });
    }
    if (underdogGoalRuleApplied && underdogCandidate) {
        const uLabel = underdogCandidate.label;
        scored = scored.map((s) => {
            if (s.label === uLabel)
                return { ...s, totalScore: (s.totalScore ?? 0) + 0.10 };
            if (s.label.endsWith('-0') && s.home !== s.away) {
                return { ...s, totalScore: (s.totalScore ?? 0) - 0.05 };
            }
            return s;
        });
    }
    scored.sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const best = scored[0] ?? scoreCandidate({ home: rawPoisson.home, away: rawPoisson.away, label: rawPoisson.label, source: 'poisson-fallback' }, input, topPoissonProb);
    const representativeLabel = best.label;
    const selectionReason = buildSelectionReason(best, input, { dominanceRuleApplied, cleanSheetRuleApplied, drawRuleApplied, upsetRuleApplied, underdogGoalRuleApplied }, input.home.team, input.away.team);
    const scoreline = {
        rawPoissonMostLikely: rawPoisson.label,
        representativeScoreline: representativeLabel,
        selectedScoreline: representativeLabel,
        selectionReason,
        home: best.home,
        away: best.away,
    };
    const diagnostics = {
        rawPoissonTopScores: topPoisson.slice(0, 10),
        candidateScores: scored.slice(0, 15),
        dominanceRuleApplied,
        cleanSheetRuleApplied,
        drawRuleApplied,
        upsetRuleApplied,
        underdogGoalRuleApplied,
        goalBandHome,
        goalBandAway,
        selectionReason,
        scorelineConfidence: round((best.totalScore ?? 0) * 100, 1),
    };
    return { scoreline, diagnostics };
}
