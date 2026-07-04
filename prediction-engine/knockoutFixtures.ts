import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  KnockoutFixture,
  KnockoutFixtureTeam,
  KnockoutMatchListResponse,
  LoadedMasterModel,
  OfficialKnockoutFixturesExport,
} from './types.js';
import { buildKnockoutPairings } from './matchPredictor.js';
import { resolveTeamName } from './loadData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const KNOCKOUT_FIXTURES_FILE = join(PROJECT_ROOT, 'data/worldcup-live/worldcup-knockout-fixtures.json');

const TEAM_FLAG_CODES: Record<string, string> = {
  Algeria: 'DZ',
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Belgium: 'BE',
  'Bosnia and Herzegovina': 'BA',
  Brazil: 'BR',
  Canada: 'CA',
  'Cape Verde': 'CV',
  Colombia: 'CO',
  Croatia: 'HR',
  Czechia: 'CZ',
  'DR Congo': 'CD',
  Ecuador: 'EC',
  Egypt: 'EG',
  England: 'GB-ENG',
  France: 'FR',
  Germany: 'DE',
  Ghana: 'GH',
  Haiti: 'HT',
  Iran: 'IR',
  Iraq: 'IQ',
  'Ivory Coast': 'CI',
  Japan: 'JP',
  Jordan: 'JO',
  Mexico: 'MX',
  Morocco: 'MA',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Norway: 'NO',
  Panama: 'PA',
  Paraguay: 'PY',
  Portugal: 'PT',
  Qatar: 'QA',
  'Saudi Arabia': 'SA',
  Scotland: 'GB-SCT',
  Senegal: 'SN',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  Sweden: 'SE',
  Switzerland: 'CH',
  Tunisia: 'TN',
  Türkiye: 'TR',
  Curaçao: 'CW',
  'United States': 'US',
  Uruguay: 'UY',
  Uzbekistan: 'UZ',
};

function flagEmoji(code: string): string | null {
  if (code.startsWith('GB-')) {
    if (code === 'GB-ENG') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    if (code === 'GB-SCT') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  }
  if (code.length !== 2) return null;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    upper.charCodeAt(0) + 127397,
    upper.charCodeAt(1) + 127397,
  );
}

export function getTeamFlag(teamName: string): string | null {
  const code = TEAM_FLAG_CODES[teamName];
  return code ? flagEmoji(code) : null;
}

function slugify(home: string, away: string, fixtureId?: number | null): string {
  const base = `${home}--${away}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return fixtureId != null ? `${base}--${fixtureId}` : base;
}

export function loadOfficialKnockoutFixturesFile(): OfficialKnockoutFixturesExport | null {
  if (!existsSync(KNOCKOUT_FIXTURES_FILE)) return null;
  return JSON.parse(readFileSync(KNOCKOUT_FIXTURES_FILE, 'utf8')) as OfficialKnockoutFixturesExport;
}

function buildTeamMeta(
  model: LoadedMasterModel,
  apiName: string,
  officialName: string | null,
  teamId: number | null,
  seed: number | null,
): KnockoutFixtureTeam {
  const resolved = officialName
    ?? resolveTeamName(apiName, model.teamsByName.keys())
    ?? apiName;
  const team = model.teamsByName.get(resolved);

  return {
    name: apiName,
    officialName: resolved,
    flag: getTeamFlag(resolved),
    group: team?.group ?? null,
    groupFinish: team?.masterGroupStageRecord?.groupFinish ?? null,
    seed,
    teamId,
  };
}

function mapOfficialFixture(
  model: LoadedMasterModel,
  row: OfficialKnockoutFixturesExport['fixtures'][number],
): KnockoutFixture {
  return {
    id: slugify(row.homeTeam, row.awayTeam, row.fixtureId),
    fixtureId: row.fixtureId,
    round: row.round ?? row.stage ?? 'Knockout',
    stage: row.stage ?? null,
    kickoffTime: row.kickoffUTC,
    kickoffLocal: row.kickoffLocal,
    home: buildTeamMeta(model, row.homeTeam, row.homeTeamOfficial ?? null, row.homeTeamId, null),
    away: buildTeamMeta(model, row.awayTeam, row.awayTeamOfficial ?? null, row.awayTeamId, null),
    venue: row.venue,
    city: row.city,
    status: row.status,
    isSynthetic: false,
    syntheticNote: null,
    source: 'api-football',
  };
}

function buildOfficialMatchList(
  model: LoadedMasterModel,
  exportData: OfficialKnockoutFixturesExport,
): KnockoutMatchListResponse {
  const fixtures = exportData.fixtures.map((row) => mapOfficialFixture(model, row));
  const rounds = exportData.rounds?.length
    ? exportData.rounds.join(', ')
    : [...new Set(fixtures.map((f) => f.stage).filter(Boolean))].join(', ');

  return {
    round: rounds || 'Knockout Stage',
    exportedAt: exportData.exportedAt,
    isSynthetic: false,
    source: 'api-football',
    statusMessage: 'Official API-Football fixtures loaded',
    syntheticNote: null,
    dataNote: `${fixtures.length} upcoming knockout fixtures from API-Football (league ${exportData.league}, season ${exportData.season}).`,
    kickoffAvailable: fixtures.some((f) => f.kickoffTime != null),
    error: null,
    fixtures,
  };
}

function buildSyntheticMatchList(model: LoadedMasterModel): KnockoutMatchListResponse {
  const pairings = buildKnockoutPairings(model);
  const syntheticNote = model.knockoutBracketNote
    ?? 'Knockout bracket pairings are not stored in the master model.';

  const fixtures: KnockoutFixture[] = pairings.map(({ home, away, seedHome, seedAway }) => {
    const homeTeam = model.teamsByName.get(home);
    const awayTeam = model.teamsByName.get(away);

    return {
      id: slugify(home, away),
      fixtureId: null,
      round: 'Round of 32 (synthetic seeding)',
      stage: 'Round of 32 (synthetic)',
      kickoffTime: null,
      kickoffLocal: null,
      venue: null,
      city: null,
      status: null,
      home: {
        name: home,
        officialName: home,
        flag: getTeamFlag(home),
        group: homeTeam?.group ?? null,
        groupFinish: homeTeam?.masterGroupStageRecord?.groupFinish ?? null,
        seed: seedHome,
        teamId: null,
      },
      away: {
        name: away,
        officialName: away,
        flag: getTeamFlag(away),
        group: awayTeam?.group ?? null,
        groupFinish: awayTeam?.masterGroupStageRecord?.groupFinish ?? null,
        seed: seedAway,
        teamId: null,
      },
      isSynthetic: true,
      syntheticNote: `${syntheticNote} Seed #${seedHome} vs #${seedAway}.`,
      source: 'synthetic',
    };
  });

  return {
    round: 'Round of 32 (synthetic seeding)',
    exportedAt: model.exportedAt,
    isSynthetic: true,
    source: 'synthetic',
    statusMessage: 'SYNTHETIC FALLBACK — NOT OFFICIAL FIXTURES',
    syntheticNote,
    dataNote: 'Official knockout export missing. Run: npm run update-knockout-fixtures',
    kickoffAvailable: false,
    error: null,
    fixtures,
  };
}

/**
 * Knockout match list — official API-Football export first, synthetic fallback only if file missing.
 */
export function getKnockoutMatchList(model: LoadedMasterModel): KnockoutMatchListResponse {
  const official = loadOfficialKnockoutFixturesFile();

  if (official?.fixtures?.length) {
    return buildOfficialMatchList(model, official);
  }

  if (official && !official.fixtures.length) {
    return {
      round: 'Knockout Stage',
      exportedAt: official.exportedAt,
      isSynthetic: false,
      source: 'api-football',
      statusMessage: 'No official knockout fixtures found from API-Football.',
      syntheticNote: null,
      dataNote: 'Run npm run update-knockout-fixtures after knockout fixtures are published.',
      kickoffAvailable: false,
      error: 'No official knockout fixtures found from API-Football.',
      fixtures: [],
    };
  }

  return buildSyntheticMatchList(model);
}

export function findKnockoutFixture(
  model: LoadedMasterModel,
  home: string,
  away: string,
): KnockoutFixture | null {
  const list = getKnockoutMatchList(model);
  return list.fixtures.find(
    (fixture) => fixture.home.name === home && fixture.away.name === away,
  ) ?? list.fixtures.find(
    (fixture) => fixture.home.officialName === home && fixture.away.officialName === away,
  ) ?? null;
}

export { KNOCKOUT_FIXTURES_FILE };
