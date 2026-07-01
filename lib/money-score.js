const LEVEL_MIN = 1;
const LEVEL_MAX = 5;

// Theoretical min/max of the raw formula below, used to normalize to a 0~100 scale.
const RAW_MIN =
  LEVEL_MIN * 20 + LEVEL_MIN * 25 + LEVEL_MIN * 25 + LEVEL_MIN * 10 - LEVEL_MAX * 15;
const RAW_MAX =
  LEVEL_MAX * 20 + LEVEL_MAX * 25 + LEVEL_MAX * 25 + LEVEL_MAX * 10 - LEVEL_MIN * 15;

export function calculateMoneyScore({
  searchVolumeLevel,
  cpcLevel,
  competitionLevel,
  commercialLevel,
  seasonality,
}) {
  const raw =
    Number(searchVolumeLevel) * 20 +
    Number(cpcLevel) * 25 +
    Number(commercialLevel) * 25 +
    Number(seasonality) * 10 -
    Number(competitionLevel) * 15;

  const normalized = ((raw - RAW_MIN) / (RAW_MAX - RAW_MIN)) * 100;
  return Math.round(Math.min(100, Math.max(0, normalized)));
}
