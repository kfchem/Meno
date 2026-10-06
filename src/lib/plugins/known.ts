/**
 * The plugins Meno knows of: their manifests (./manifests), read as data as
 * one fetched would be (./manifest). Meno's own list for now; a list fetched
 * online needs a way to trust it, and comes later.
 */
import { acceptManifest, type Manifest } from "./manifest";
import cclib from "./manifests/cclib.json";
import pyscf from "./manifests/pyscf.json";

export const MANIFESTS: readonly Manifest[] = [cclib, pyscf].map(acceptManifest).filter((m): m is Manifest => m != null);
