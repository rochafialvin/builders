import Image from "./opengraph-image";
import { site } from "../../lib/site";

/**
 * The same card for X: the root layout's twitter image would otherwise stand
 * in for this one, since the file beside a page replaces only what it names.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = site.name;

export default Image;
