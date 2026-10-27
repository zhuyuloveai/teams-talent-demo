package com.carddemo.card.application;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 002-C09：导出 CSV 的 RFC4180 转义与表格公式注入防护。 */
class ReplacementExportCsvTest {

    @Test
    void plainValuesAreUnchanged() {
        assertThat(ReplacementExportService.csvField("SF100")).isEqualTo("SF100");
        assertThat(ReplacementExportService.csvField(null)).isEmpty();
        assertThat(ReplacementExportService.csvField("")).isEmpty();
    }

    @Test
    void commasQuotesAndNewlinesAreQuoted() {
        assertThat(ReplacementExportService.csvField("SF,100")).isEqualTo("\"SF,100\"");
        assertThat(ReplacementExportService.csvField("SF\"100")).isEqualTo("\"SF\"\"100\"");
        assertThat(ReplacementExportService.csvField("SF\n100")).isEqualTo("\"SF\n100\"");
        assertThat(ReplacementExportService.csvField("SF\r100")).isEqualTo("\"SF\r100\"");
    }

    @Test
    void spreadsheetFormulasAreNeutralised() {
        assertThat(ReplacementExportService.csvField("=cmd|' /C calc'!A0"))
                .isEqualTo("'=cmd|' /C calc'!A0");
        assertThat(ReplacementExportService.csvField("+1+1")).isEqualTo("'+1+1");
        assertThat(ReplacementExportService.csvField("-1-1")).isEqualTo("'-1-1");
        assertThat(ReplacementExportService.csvField("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(ReplacementExportService.csvField("=SUM(A1),A2")).isEqualTo("\"'=SUM(A1),A2\"");
    }
}
