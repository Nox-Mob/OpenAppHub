import type { HubContext } from "@/lib/orgs";
import type { SessionUser } from "@/lib/session";

/** What every signed-in screen gets from the /_app layout. */
export type ScreenProps = { user: SessionUser; hub: HubContext };
