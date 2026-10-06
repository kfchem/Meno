/**
 * The roles Meno defines (docs/PLUGINS.md, *Roles*): jobs besides reading
 * and writing files, each with what it is given and what it gives, filled by
 * a plugin that says in its manifest that it fills it. Meno names roles, not
 * plugins. A core role is one Meno's everyday drawing rests on; it is chosen
 * where it is used - in Settings, *Chemistry* or *Molecules in 3D*.
 */

export type Role = {
  /** What it does, as the chemist reads it in Settings. */
  name: string;
  /** Where in Settings who fills it is chosen. */
  where: "chemistry" | "molecules3d";
};

export const ROLES = {
  smiles: { name: "SMILES to a structure, and back", where: "chemistry" },
  checks: { name: "Hydrogens, valence and aromatic rings", where: "chemistry" },
  "stereo-labels": { name: "R and S, E and Z", where: "chemistry" },
  stereoisomers: { name: "Stereoisomers of what is drawn without a configuration", where: "molecules3d" },
  conformers: { name: "Structures in 3D, and their conformers", where: "molecules3d" },
  drawing: { name: "A molecule in 3D drawn as a formula", where: "molecules3d" },
} as const satisfies Record<string, Role>;

export type RoleId = keyof typeof ROLES;

/** Whether an id is a role Meno defines. */
export const isRole = (id: string): id is RoleId => Object.prototype.hasOwnProperty.call(ROLES, id);
