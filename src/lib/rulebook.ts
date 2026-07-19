import rulebookData from "../../data/rulebook.json";

import { rulebookSchema } from "@/lib/contracts";

export const rulebook = rulebookSchema.parse(rulebookData);
