/**
 * EdgeStats Prediction Engine V2 — layered pipeline orchestrator.
 *
 * Layer 1: Data (loadData)
 * Layer 2: Ratings (teamRatings / buildTeamMatchProfile)
 * Layer 3: Expected match statistics (statProjectionModel — shots/corners/saves/cards unchanged)
 * Layer 3b: Expected goals calibration (expectedGoalsCalibration)
 * Layer 4: Probability engine (probabilityEngine)
 * Layer 5: Scoreline selection (representativeScoreline)
 */
import { buildTeamMatchProfile, round } from './teamRatings.js';
import { projectMatchStats } from './statProjectionModel.js';
import { calibrateExpectedGoals } from './layers/expectedGoalsCalibration.js';
import { runProbabilityEngine } from './layers/probabilityEngine.js';
import { selectRepresentativeScoreline } from './representativeScoreline.js';
import { pickMostLikelyScoreline } from './scorelineModel.js';
export const ENGINE_VERSION = 'v2-calibration';
function buildV2Diagnostics(probabilityOutput, scorelineDiagnostics, scorelineConfidence, statConsistencyScore, modelConfidence) {
    return {
        engineVersion: ENGINE_VERSION,
        modelConfidence,
        statConsistencyScore,
        expectedGoalDifference: probabilityOutput.expectedGoalDifference,
        dominanceIndex: probabilityOutput.dominanceIndex,
        cleanSheetProbabilityHome: probabilityOutput.cleanSheetProbabilityHome,
        cleanSheetProbabilityAway: probabilityOutput.cleanSheetProbabilityAway,
        scorelineConfidence,
        topWinProbabilities: probabilityOutput.topWinProbabilities,
        top10Scorelines: scorelineDiagnostics.rawPoissonTopScores.map((s) => ({
            label: s.label,
            probability: s.probability,
        })),
        mainReasons: probabilityOutput.mainReasons,
        drawCalibrationApplied: probabilityOutput.drawCalibrationApplied,
        knockoutMode: probabilityOutput.knockoutMode,
        rawPoissonProbabilities: probabilityOutput.rawPoissonProbabilities,
    };
}
export function runPredictionPipeline(ctx) {
    const { model, home, away } = ctx;
    const statProjection = projectMatchStats(model, home, away);
    const calibratedGoals = calibrateExpectedGoals(model, home, away, statProjection);
    const homeShots = statProjection.expectedStats.shots[home.team]?.total ?? null;
    const awayShots = statProjection.expectedStats.shots[away.team]?.total ?? null;
    const homeSoT = statProjection.expectedStats.shots[home.team]?.onTarget ?? null;
    const awaySoT = statProjection.expectedStats.shots[away.team]?.onTarget ?? null;
    const homeCorners = statProjection.expectedStats.corners[home.team] ?? null;
    const awayCorners = statProjection.expectedStats.corners[away.team] ?? null;
    const homeSaves = statProjection.expectedStats.saves[`${home.team}GK`] ?? null;
    const awaySaves = statProjection.expectedStats.saves[`${away.team}GK`] ?? null;
    const probabilityOutput = runProbabilityEngine({
        home,
        away,
        calibratedGoals,
        homeShots,
        awayShots,
        homeSoT,
        awaySoT,
        knockoutMatch: true,
    });
    const rawPoisson = pickMostLikelyScoreline(probabilityOutput.homeLambda, probabilityOutput.awayLambda);
    const { scoreline, diagnostics: scorelineDiagnostics } = selectRepresentativeScoreline({
        home,
        away,
        homeLambda: probabilityOutput.homeLambda,
        awayLambda: probabilityOutput.awayLambda,
        probabilities: probabilityOutput.probabilities,
        homeXG: calibratedGoals.displayHome ?? calibratedGoals.home ?? 1.2,
        awayXG: calibratedGoals.displayAway ?? calibratedGoals.away ?? 1.0,
        homeShots,
        awayShots,
        homeSoT,
        awaySoT,
        homeCorners,
        awayCorners,
        homeSaves,
        awaySaves,
        dominanceIndex: probabilityOutput.dominanceIndex,
        cleanSheetProbabilityHome: probabilityOutput.cleanSheetProbabilityHome,
        cleanSheetProbabilityAway: probabilityOutput.cleanSheetProbabilityAway,
        expectedGoalDifference: probabilityOutput.expectedGoalDifference,
    });
    const topCandidate = scorelineDiagnostics.candidateScores[0];
    const scorelineConfidence = topCandidate?.totalScore != null
        ? round(topCandidate.totalScore * 100, 1)
        : null;
    const v2Diagnostics = buildV2Diagnostics(probabilityOutput, scorelineDiagnostics, scorelineConfidence, null, null);
    return {
        statProjection,
        calibratedGoals,
        probabilityOutput,
        scoreline,
        scorelineDiagnostics,
        v2Diagnostics,
        rawPoisson,
    };
}
export { buildTeamMatchProfile };
