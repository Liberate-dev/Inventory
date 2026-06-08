<?php
/**
 * Asset Depreciation Calculation Engine
 * Supports: Straight-Line, Declining-Balance, Units-of-Production, Sum-of-Years
 */

class DepreciationCalculator {

    /**
     * Calculate monthly depreciation using Straight-Line method
     * Formula: (Cost - Salvage) / Useful Life Months
     */
    public static function straightLine(float $acquisitionCost, float $salvageValue, int $usefulLifeMonths): array {
        if ($usefulLifeMonths <= 0) {
            return [
                'method' => 'straight_line',
                'depreciable_amount' => 0,
                'monthly_depreciation' => 0,
                'annual_depreciation' => 0,
            ];
        }

        $depreciableAmount = $acquisitionCost - $salvageValue;
        $monthlyDepreciation = $depreciableAmount / $usefulLifeMonths;

        return [
            'method' => 'straight_line',
            'depreciable_amount' => $depreciableAmount,
            'monthly_depreciation' => round($monthlyDepreciation, 2),
            'annual_depreciation' => round($monthlyDepreciation * 12, 2),
        ];
    }

    /**
     * Calculate monthly depreciation using Declining-Balance method
     * Formula: Book Value × (Rate / 12)
     * Note: Automatically adjusts in final period to not go below salvage value
     */
    public static function decliningBalance(float $bookValue, float $rate): float {
        // rate is annual percentage (e.g., 25 for 25%)
        $monthlyDepreciation = $bookValue * ($rate / 100) / 12;
        return round($monthlyDepreciation, 2);
    }

    /**
     * Calculate depreciation using Units-of-Production method
     * Formula: (Cost - Salvage) / Total Units × Actual Units this period
     */
    public static function unitsOfProduction(float $acquisitionCost, float $salvageValue, int $totalUnits): float {
        return ($acquisitionCost - $salvageValue) / $totalUnits;
    }

    /**
     * Calculate depreciation using Sum-of-Years Digits method
     * Formula: (Cost - Salvage) × (Remaining Life / Sum of Years)
     * Sum of Years = n(n+1)/2 where n = useful life in years
     */
    public static function sumOfYears(float $acquisitionCost, float $salvageValue, int $usefulLifeYears, int $currentYear): float {
        $depreciableAmount = $acquisitionCost - $salvageValue;
        $sumOfYears = ($usefulLifeYears * ($usefulLifeYears + 1)) / 2;
        $remainingLife = $usefulLifeYears - $currentYear + 1;
        return $depreciableAmount * ($remainingLife / $sumOfYears);
    }

    /**
     * Calculate pro-rata depreciation for first/last partial periods
     * Used when acquisition date is not first day of month
     */
    public static function calculateProRata(
        float $monthlyDepreciation,
        string $acquisitionDate,
        string $periodStartDate
    ): float {
        $acquisitionTs = strtotime($acquisitionDate);
        $periodTs = strtotime($periodStartDate);

        if ($acquisitionTs === false || $periodTs === false) {
            return $monthlyDepreciation;
        }

        // Get first day of acquisition month
        $firstDayOfMonth = mktime(0, 0, 0, date('n', $acquisitionTs), 1, date('Y', $acquisitionTs));
        $daysInMonth = date('t', $acquisitionTs);
        $dayOfAcquisition = date('j', $acquisitionTs);

        // Pro-rata days from acquisition to end of month
        $prorataDays = $daysInMonth - $dayOfAcquisition + 1;
        $prorataFactor = $prorataDays / $daysInMonth;

        return round($monthlyDepreciation * $prorataFactor, 2);
    }

    /**
     * Generate complete depreciation schedule for an asset
     * Returns array of scheduled depreciation per period
     */
    public static function generateSchedule(array $asset): array {
        $acquisitionCost = (float) $asset['acquisition_cost'];
        $salvageValue = (float) $asset['salvage_value'];
        $depreciableAmount = $acquisitionCost - $salvageValue;
        $method = $asset['depreciation_method'];
        $usefulLifeMonths = (int) $asset['useful_life_months'];
        $depreciationRate = isset($asset['depreciation_rate']) ? (float) $asset['depreciation_rate'] : null;
        $depreciationStartDate = $asset['depreciation_start_date'];

        if ($usefulLifeMonths <= 0 || $depreciableAmount <= 0) {
            return [];
        }

        $schedule = [];
        $accumulatedDepreciation = 0;
        $openingBookValue = $acquisitionCost;

        // Parse start date
        $startDateTs = strtotime($depreciationStartDate);
        $currentYear = (int) date('Y', $startDateTs);
        $currentMonth = (int) date('n', $startDateTs);
        $usefulLifeYears = (int) ceil($usefulLifeMonths / 12);

        // Calculate base monthly depreciation for methods that need it
        $baseMonthlyDep = $depreciableAmount / $usefulLifeMonths;

        for ($i = 0; $i < $usefulLifeMonths; $i++) {
            // Calculate period dates
            $periodDateTs = mktime(0, 0, 0, $currentMonth + $i, 1, $currentYear);
            $periodYear = (int) date('Y', $periodDateTs);
            $periodMonth = (int) date('n', $periodDateTs);

            // Determine if this is the first period (pro-rata calculation)
            $isFirstPeriod = ($i === 0);
            $isLastPeriod = ($i === $usefulLifeMonths - 1);

            // Calculate depreciation for this period
            $depAmount = 0;
            $isProrata = false;
            $prorataDays = null;

            switch ($method) {
                case 'straight_line':
                    $depAmount = $baseMonthlyDep;
                    if ($isFirstPeriod && $depreciationStartDate !== date('Y-m-01', $periodDateTs)) {
                        $depAmount = self::calculateProRata($baseMonthlyDep, $depreciationStartDate, $depreciationStartDate);
                        $isProrata = true;
                        $prorataDays = (int) (date('t', $periodDateTs) - (int) date('j', $startDateTs) + 1);
                    }
                    if ($isLastPeriod) {
                        // Ensure we don't over-depreciate
                        $maxDep = $openingBookValue - $salvageValue;
                        $depAmount = min($depAmount, $maxDep);
                    }
                    break;

                case 'declining_balance':
                    $rate = $depreciationRate ?? 25.0; // default 25%
                    $depAmount = self::decliningBalance($openingBookValue, $rate);
                    if ($isLastPeriod) {
                        $maxDep = $openingBookValue - $salvageValue;
                        $depAmount = min($depAmount, $maxDep);
                    }
                    if ($depAmount < 0) $depAmount = 0;
                    break;

                case 'units_of_production':
                    // For UoP, actual units must be provided per period
                    // Placeholder - returns average monthly depreciation
                    $depAmount = $baseMonthlyDep;
                    break;

                case 'sum_of_years':
                    $currentYearIndex = $i + 1;
                    $annualDep = self::sumOfYears($acquisitionCost, $salvageValue, $usefulLifeYears, $currentYearIndex);
                    $depAmount = $annualDep / 12;
                    if ($isLastPeriod) {
                        $maxDep = $openingBookValue - $salvageValue;
                        $depAmount = min($depAmount, $maxDep);
                    }
                    break;
            }

            $accumulatedDepreciation += $depAmount;
            $closingBookValue = $openingBookValue - $depAmount;

            // Ensure closing book value doesn't go below salvage value
            if ($closingBookValue < $salvageValue) {
                $closingBookValue = $salvageValue;
                $depAmount = $openingBookValue - $salvageValue;
                $accumulatedDepreciation = $acquisitionCost - $salvageValue;
            }

            $schedule[] = [
                'period_year' => $periodYear,
                'period_month' => $periodMonth,
                'opening_book_value' => round($openingBookValue, 2),
                'depreciation_amount' => round($depAmount, 2),
                'accumulated_depreciation' => round($accumulatedDepreciation, 2),
                'closing_book_value' => round($closingBookValue, 2),
                'is_prorata' => $isProrata ? 1 : 0,
                'prorata_days' => $prorataDays,
            ];

            // Update opening book value for next period
            $openingBookValue = $closingBookValue;

            // Break if asset is fully depreciated
            if ($closingBookValue <= $salvageValue) {
                break;
            }
        }

        return $schedule;
    }

    /**
     * Calculate book value at a specific date
     * Returns the book value considering all depreciation up to that date
     */
    public static function calculateBookValueAtDate(array $asset, string $targetDate): float {
        $acquisitionCost = (float) $asset['acquisition_cost'];
        $salvageValue = (float) $asset['salvage_value'];
        $depreciationStartDate = $asset['depreciation_start_date'];

        $targetTs = strtotime($targetDate);
        $startTs = strtotime($depreciationStartDate);

        if ($targetTs === false || $startTs === false) {
            return $acquisitionCost;
        }

        // Calculate months between start date and target date
        $monthsElapsed = (int) ((date('Y', $targetTs) - date('Y', $startTs)) * 12 +
                                (date('n', $targetTs) - date('n', $startTs)));

        if ($monthsElapsed <= 0) {
            return $acquisitionCost;
        }

        $usefulLifeMonths = (int) $asset['useful_life_months'];
        $method = $asset['depreciation_method'];

        if ($monthsElapsed >= $usefulLifeMonths) {
            return $salvageValue;
        }

        $depreciableAmount = $acquisitionCost - $salvageValue;
        $monthlyDep = $depreciableAmount / $usefulLifeMonths;
        $accumulatedDep = $monthlyDep * $monthsElapsed;

        return round($acquisitionCost - $accumulatedDep, 2);
    }

    /**
     * Get accumulated depreciation at a specific date
     */
    public static function calculateAccumulatedDepreciationAtDate(array $asset, string $targetDate): float {
        $acquisitionCost = (float) $asset['acquisition_cost'];
        $salvageValue = (float) $asset['salvage_value'];
        $bookValue = self::calculateBookValueAtDate($asset, $targetDate);

        return round($acquisitionCost - $bookValue, 2);
    }
}

/**
 * Asset Number Generator
 * Format: AST-YYYY-NNNN
 */
class AssetNumberGenerator {

    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * Generate next asset number for a given year
     */
    public function generate(int $year): string {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) + 1 as next_number
            FROM assets
            WHERE YEAR(acquisition_date) = ?
        ");
        $stmt->execute([$year]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $sequence = (int) ($result['next_number'] ?? 1);

        return sprintf("AST-%d-%04d", $year, $sequence);
    }
}

/**
 * Journal Entry Generator
 * Ensures journal entries are balanced (debit = credit)
 */
class JournalGenerator {

    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * Generate journal number
     */
    public function generateJournalNumber(string $type, ?string $entryDate = null): string {
        $baseDate = $entryDate ?: date('Y-m-d');
        $year = (int) date('Y', strtotime($baseDate));
        $month = (int) date('n', strtotime($baseDate));

        $stmt = $this->db->prepare("
            SELECT COUNT(*) + 1 as next_number
            FROM journal_entries
            WHERE YEAR(entry_date) = ? AND MONTH(entry_date) = ?
        ");
        $stmt->execute([$year, $month]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $sequence = (int) ($result['next_number'] ?? 1);

        return sprintf("JRN-%d-%02d-%04d", $year, $month, $sequence);
    }

    /**
     * Create balanced journal entry
     */
    public function createJournal(
        string $entryDate,
        string $type,
        string $description,
        array $lines,
        int $createdBy
    ): int {
        $totalDebit = 0;
        $totalCredit = 0;

        foreach ($lines as $line) {
            $totalDebit += (float) ($line['debit_amount'] ?? 0);
            $totalCredit += (float) ($line['credit_amount'] ?? 0);
        }

        // Validate balance
        if (abs($totalDebit - $totalCredit) > 0.01) {
            throw new Exception("Journal entries must be balanced. Debit: {$totalDebit}, Credit: {$totalCredit}");
        }

        $journalNumber = $this->generateJournalNumber($type, $entryDate);
        $periodYear = (int) date('Y', strtotime($entryDate));
        $periodMonth = (int) date('n', strtotime($entryDate));

        // Insert journal header
        $stmt = $this->db->prepare("
            INSERT INTO journal_entries
            (journal_number, entry_date, period_year, period_month, type, description,
             total_debit, total_credit, status, created_by, posted_by, posted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, NOW())
        ");
        $stmt->execute([
            $journalNumber, $entryDate, $periodYear, $periodMonth, $type, $description,
            $totalDebit, $totalCredit, $createdBy, $createdBy
        ]);

        $journalId = (int) $this->db->lastInsertId();

        // Insert journal lines
        $lineStmt = $this->db->prepare("
            INSERT INTO journal_entry_lines
            (journal_entry_id, line_number, account_code, account_name, debit_amount, credit_amount, asset_id, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $lineNumber = 1;
        foreach ($lines as $line) {
            $lineStmt->execute([
                $journalId,
                $lineNumber++,
                $line['account_code'],
                $line['account_name'] ?? null,
                $line['debit_amount'] ?? 0,
                $line['credit_amount'] ?? 0,
                $line['asset_id'] ?? null,
                $line['description'] ?? null
            ]);
        }

        return $journalId;
    }
}
