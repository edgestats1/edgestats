function num(value) {
    if (value == null)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function buildPowerSlice(team) {
    const p = team.powerRanking ?? {};
    return {
        rank: num(p.rank),
        overallPowerScore: num(p.overallPowerScore),
        attackRating: num(p.attackRating),
        defenceRating: num(p.defenceRating),
        chanceCreationRating: num(p.chanceCreationRating),
        finishingRating: num(p.finishingRating),
        cornerRating: num(p.cornerRating),
        disciplineRating: num(p.disciplineRating),
        goalkeeperRating: num(p.goalkeeperRating),
        currentFormRating: num(p.currentFormRating),
        worldCupMatchesPlayed: num(p.worldCupMatchesPlayed),
        dataSource: p.dataSource ?? null,
    };
}
function buildTournamentAverages(team, model) {
    const avg = team.tournamentTotals?.averages ?? {};
    const defensive = model.defensiveAveragesByTeam.get(team.team);
    return {
        goalsFor: num(avg.goalsFor),
        goalsAgainst: num(avg.goalsAgainst),
        xG: num(avg.xG),
        xGAgainst: num(avg.xGAgainst),
        shots: num(avg.shots),
        shotsAgainst: defensive?.shotsAgainst ?? num(avg.shotsAgainst),
        cornersFor: num(avg.cornersFor),
        cornersAgainst: num(avg.cornersAgainst),
        shotsOnTarget: num(avg.shotsOnTarget),
        shotsOnTargetAgainst: defensive?.shotsOnTargetAgainst ?? num(avg.shotsOnTargetAgainst),
        yellowCards: num(avg.yellowCards),
        savesFor: num(avg.savesFor),
        possessionAverage: num(avg.possessionAverage),
    };
}
function buildCornerTrends(team) {
    const c = team.cornerTrends ?? {};
    return {
        averageCornersFor: num(c.averageCornersFor),
        averageCornersAgainst: num(c.averageCornersAgainst),
        projectedRound2CornerStrength: num(c.projectedRound2CornerStrength),
    };
}
function buildCardTrends(team) {
    const c = team.cardTrends ?? {};
    return {
        projectedRound2CardRisk: num(c.projectedRound2CardRisk),
        disciplineRating: num(c.disciplineRating),
        yellowCards: num(c.yellowCards),
        redCards: num(c.redCards),
    };
}
function selectPrimaryGoalkeeper(model, teamName) {
    const keepers = model.goalkeepersByTeam.get(teamName) ?? [];
    if (!keepers.length)
        return null;
    return keepers[0] ?? null;
}
function buildPlayerThreat(player, teamName) {
    const wc = player.worldCupStatistics;
    const wcGoals = num(wc?.goals);
    const wcAssists = num(wc?.assists);
    const clubGoals = num(player.goals);
    const clubAssists = num(player.assists);
    if (wcGoals == null && wcAssists == null && clubGoals == null)
        return null;
    const threatScore = (wcGoals ?? 0) * 1.0
        + (wcAssists ?? 0) * 0.65
        + (clubGoals ?? 0) * 0.08
        + (clubAssists ?? 0) * 0.05;
    if (threatScore <= 0)
        return null;
    return {
        playerId: num(wc?.playerId) ?? num(player.id),
        name: wc?.playerName ?? player.name,
        team: teamName,
        worldCupGoals: wcGoals,
        worldCupAssists: wcAssists,
        clubGoals,
        threatScore: Math.round(threatScore * 100) / 100,
        note: wcGoals != null || wcAssists != null
            ? 'Includes World Cup tournament stats'
            : 'Club-season threat only; no World Cup player stats in export',
    };
}
export function buildKeyThreats(model, teamName, limit = 3) {
    const players = model.playersByCountry.get(teamName) ?? [];
    return players
        .map((player) => buildPlayerThreat(player, teamName))
        .filter((row) => row != null)
        .sort((a, b) => (b.threatScore ?? 0) - (a.threatScore ?? 0))
        .slice(0, limit);
}
export function buildTeamMatchProfile(model, team) {
    const teamName = team.team;
    const power = buildPowerSlice(team);
    const tournamentAverages = buildTournamentAverages(team, model);
    const cornerTrends = buildCornerTrends(team);
    const cardTrends = buildCardTrends(team);
    const primaryGoalkeeper = selectPrimaryGoalkeeper(model, teamName);
    const keyThreats = buildKeyThreats(model, teamName);
    const hasWorldCupPlayerStats = keyThreats.some((t) => t.worldCupGoals != null || t.worldCupAssists != null);
    const dataCompleteness = {
        hasPowerRating: power.overallPowerScore != null,
        hasTournamentTotals: tournamentAverages.goalsFor != null,
        hasCornerTrends: cornerTrends.averageCornersFor != null,
        hasCardTrends: cardTrends.projectedRound2CardRisk != null,
        hasGoalkeeper: primaryGoalkeeper != null,
        hasWorldCupPlayerStats,
        worldCupMatchesPlayed: power.worldCupMatchesPlayed,
    };
    return {
        team: teamName,
        group: team.group ?? null,
        qualified: team.masterGroupStageRecord?.qualified ?? model.qualifiedTeams.includes(teamName),
        power,
        tournamentAverages,
        finishingEfficiency: num(team.tournamentTotals?.finishingEfficiency),
        cornerTrends,
        cardTrends,
        primaryGoalkeeper,
        keyThreats,
        dataCompleteness,
    };
}
/** Weighted attacking index using EdgeStats dimension weights. */
export function computeAttackIndex(profile, weighting) {
    const { power } = profile;
    const parts = [
        [power.attackRating, weighting.attack],
        [power.chanceCreationRating, weighting.chanceCreation],
        [power.finishingRating, weighting.finishing],
        [power.currentFormRating, weighting.currentForm],
    ];
    let totalWeight = 0;
    let weighted = 0;
    for (const [value, weight] of parts) {
        if (value == null)
            continue;
        weighted += value * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : null;
}
/** Weighted defensive index using EdgeStats dimension weights. */
export function computeDefenceIndex(profile, weighting) {
    const { power } = profile;
    const parts = [
        [power.defenceRating, weighting.defence],
        [power.goalkeeperRating, weighting.goalkeeper],
    ];
    let totalWeight = 0;
    let weighted = 0;
    for (const [value, weight] of parts) {
        if (value == null)
            continue;
        weighted += value * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : null;
}
export function computeCornerIndex(profile, weighting) {
    const { power, cornerTrends } = profile;
    const parts = [
        [power.cornerRating, weighting.corner],
        [cornerTrends.projectedRound2CornerStrength, weighting.corner],
    ];
    let totalWeight = 0;
    let weighted = 0;
    for (const [value, weight] of parts) {
        if (value == null)
            continue;
        weighted += value * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : null;
}
export function computeDisciplineRisk(profile) {
    return profile.cardTrends.projectedRound2CardRisk;
}
export function ratingGap(home, away) {
    const homeScore = home.power.overallPowerScore;
    const awayScore = away.power.overallPowerScore;
    if (homeScore == null || awayScore == null)
        return null;
    return homeScore - awayScore;
}
export function round(value, digits = 2) {
    if (value == null || !Number.isFinite(value))
        return null;
    const f = 10 ** digits;
    return Math.round(value * f) / f;
}
