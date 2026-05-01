import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";

export type ResultsEmailProps = {
  totalResponses: number;
  thresholdPercent: number;
  safePercent: number;
  averageConfidence: number;
  publicThresholdPercent: number;
  dependentThresholdPercent: number;
  resultsUrl: string;
  unsubscribeUrl: string;
};

const palette = {
  page: "#f4f1e8",
  panel: "#fbf8ef",
  ink: "#171a16",
  inkSoft: "#41433a",
  muted: "#73796e",
  rule: "#171a1626",
  accent: "#314b3f",
  accentSoft: "#dce5dc",
};

const fontStack = "'Inria Serif', Iowan Old Style, Georgia, serif";
const monoStack = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

export default function ResultsEmail({
  totalResponses,
  thresholdPercent,
  safePercent,
  averageConfidence,
  publicThresholdPercent,
  dependentThresholdPercent,
  resultsUrl,
  unsubscribeUrl,
}: ResultsEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`${totalResponses.toLocaleString()} people answered. ${thresholdPercent}% chose threshold.`}
      </Preview>
      <Body style={{ backgroundColor: palette.page, margin: 0, padding: 0 }}>
        <Container
          style={{
            maxWidth: 600,
            margin: "0 auto",
            padding: "32px 16px",
            fontFamily: fontStack,
            color: palette.ink,
          }}
        >
          <Section
            style={{
              backgroundColor: palette.panel,
              border: `1px solid ${palette.rule}`,
              padding: "36px 30px",
            }}
          >
            <Text
              style={{
                margin: 0,
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Threshold Study · Results
            </Text>
            <Heading
              style={{
                margin: "10px 0 18px",
                fontWeight: 300,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.025em",
              }}
            >
              The results are in.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Thank you for participating. Here is what {totalResponses.toLocaleString()}{" "}
              people answered.
            </Text>

            {/* Topline split */}
            <Section style={{ margin: "28px 0 0" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 8 }}>
                  <StatBlock
                    label="Chose threshold"
                    value={`${thresholdPercent}%`}
                  />
                </Column>
                <Column style={{ width: "50%", paddingLeft: 8 }}>
                  <StatBlock label="Chose safe" value={`${safePercent}%`} />
                </Column>
              </Row>
            </Section>

            <Section style={{ margin: "16px 0 0" }}>
              <Row>
                <Column style={{ width: "33%", paddingRight: 6 }}>
                  <StatBlock
                    label="Public recommend threshold"
                    value={`${publicThresholdPercent}%`}
                    small
                  />
                </Column>
                <Column style={{ width: "33%", padding: "0 6px" }}>
                  <StatBlock
                    label="Tell child threshold"
                    value={`${dependentThresholdPercent}%`}
                    small
                  />
                </Column>
                <Column style={{ width: "33%", paddingLeft: 6 }}>
                  <StatBlock
                    label="Avg confidence"
                    value={averageConfidence.toFixed(2)}
                    small
                  />
                </Column>
              </Row>
            </Section>

            <Section style={{ textAlign: "center" as const, margin: "32px 0 8px" }}>
              <Button
                href={resultsUrl}
                style={{
                  backgroundColor: palette.accent,
                  color: palette.panel,
                  fontFamily: monoStack,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "14px 22px",
                  textDecoration: "none",
                }}
              >
                Read the full results
              </Button>
            </Section>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 13, color: palette.muted }}>
              You receive this because you confirmed your email when you
              responded.
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: 12, color: palette.muted }}>
              <a
                href={unsubscribeUrl}
                style={{ color: palette.muted, textDecoration: "underline" }}
              >
                Unsubscribe
              </a>{" "}
              from all future Threshold Study emails.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function StatBlock({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <Section
      style={{
        backgroundColor: palette.accentSoft,
        border: `1px solid ${palette.rule}`,
        padding: small ? "12px 12px" : "20px 18px",
      }}
    >
      <Text
        style={{
          margin: 0,
          color: palette.muted,
          fontFamily: monoStack,
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: small ? "6px 0 0" : "8px 0 0",
          fontFamily: fontStack,
          fontWeight: 300,
          fontSize: small ? 26 : 40,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color: palette.accent,
        }}
      >
        {value}
      </Text>
    </Section>
  );
}
