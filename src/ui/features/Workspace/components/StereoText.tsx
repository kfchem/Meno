import { stereoParts } from "../chem/marks";

/**
 * A stereodescriptor as the canvas writes it beside a stereocentre or a
 * double bond: in italics, as IUPAC sets them - R and S; r and s at a
 * pseudo-asymmetric centre; E and Z; an axis's Ra and Sa, the a upright and
 * set below (IUPAC's P-91.2.1.1) - and in parentheses when the drawing's
 * style says so.
 */
export default function StereoText({ cip, parentheses }: { cip: string; parentheses: boolean }) {
  const [letter, axis] = stereoParts(cip);
  return (
    <>
      {parentheses && "("}
      <i>{letter}</i>
      {axis && <span style={{ fontSize: "0.7em", verticalAlign: "-0.25em" }}>{axis}</span>}
      {parentheses && ")"}
    </>
  );
}
