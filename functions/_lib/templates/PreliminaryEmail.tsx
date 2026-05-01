import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type PreliminaryEmailProps = {
  totalResponses: number;
  personalChoiceThresholdPct: number;
  publicRecommendationThresholdPct: number;
  dependentRecommendationThresholdPct: number;
  expectedMajorityThresholdPct: number;
  averageConfidence: number;
  /** Personal share URL with ?ref=<share_code> baked in. */
  shareUrl: string;
  /** Absolute URL to the published case study page. */
  caseStudyUrl: string;
  /** Absolute one-click unsubscribe URL (verified link). */
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

export default function PreliminaryEmail({
  totalResponses,
  personalChoiceThresholdPct,
  publicRecommendationThresholdPct,
  dependentRecommendationThresholdPct,
  expectedMajorityThresholdPct,
  averageConfidence,
  shareUrl,
  caseStudyUrl,
  unsubscribeUrl,
}: PreliminaryEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {totalResponses.toLocaleString()} answered. The split is one percentage point from a coin flip. Send three friends and watch your room form.
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
              Threshold Study · interim drop
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
              {totalResponses.toLocaleString()} answered. We just need 3 more — yours.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              The crowd is split about evenly. But the global number is the
              average of every friend group mixed together. Your room is one of
              them. We can’t see it until you bring it.
            </Text>

            <Section style={{ margin: "28px 0 0" }}>
              <Row>
                <Column style={{ width: "25%", paddingRight: 4 }}>
                  <StatBlock label="Chose group-dependent" value={`${personalChoiceThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", padding: "0 4px" }}>
                  <StatBlock label="Recommend it publicly" value={`${publicRecommendationThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", padding: "0 4px" }}>
                  <StatBlock label="Recommend it to a dependent" value={`${dependentRecommendationThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", paddingLeft: 4 }}>
                  <StatBlock label="Expect the majority will" value={`${expectedMajorityThresholdPct}%`} small />
                </Column>
              </Row>
            </Section>

            <Section
              style={{
                margin: "24px 0 0",
                padding: "14px 18px",
                backgroundColor: palette.accentSoft,
                borderLeft: `3px solid ${palette.accent}`,
              }}
            >
              <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: palette.ink }}>
                <strong style={{ fontWeight: 600 }}>Confidence is {averageConfidence.toFixed(2)} / 5.</strong>{" "}
                People feel sure. They’re sure in different directions — and the
                same person gets more cautious by{" "}
                <strong style={{ fontWeight: 600 }}>
                  {Math.round(
                    Math.abs(personalChoiceThresholdPct - dependentRecommendationThresholdPct) * 10,
                  ) / 10}{" "}
                  points
                </strong>{" "}
                when the question is for someone in their care.
              </Text>
            </Section>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 24px" }} />

            <Heading
              style={{
                margin: "0 0 14px",
                fontWeight: 300,
                fontSize: 24,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              Send your link to 3 people.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Three is the threshold. Once three friends answer through your
              link, your /results unlocks the cohort view: your crowd’s split
              vs the world, your crowd’s confidence vs the world, and how the
              answer drifts as the chain widens.
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              <strong style={{ fontWeight: 600 }}>Send the link, not this email.</strong>{" "}
              The email has spoilers; the link keeps the question clean.
            </Text>

            <Section style={{ textAlign: "center" as const, margin: "32px 0 8px" }}>
              <Button
                href={shareUrl}
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
                Send your link →
              </Button>
            </Section>
            <Text
              style={{
                margin: "16px 0 0",
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 12,
                lineHeight: 1.5,
                wordBreak: "break-all" as const,
              }}
            >
              {shareUrl}
            </Text>


            <Hr style={{ borderColor: palette.rule, margin: "28px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 13, color: palette.muted }}>
              <Link href={caseStudyUrl} style={{ color: palette.muted, textDecoration: "underline" }}>
                Read the full case study →
              </Link>
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "20px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 12, color: palette.muted }}>
              You’re getting this one-time interim note because you confirmed
              your email after responding. Final results land in your inbox
              when the study closes.
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: 12, color: palette.muted }}>
              <Link href={unsubscribeUrl} style={{ color: palette.muted, textDecoration: "underline" }}>
                Unsubscribe
              </Link>{" "}
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
