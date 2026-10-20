import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getFamilyFeatureContext } from "@/lib/family-features.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { KIOSK_ACTIVE_KEY } from "@/lib/kiosk";

export function usePersonalContext() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const getContext = useServerFn(getFamilyFeatureContext);
  const kiosk =
    typeof window !== "undefined" && window.localStorage.getItem(KIOSK_ACTIVE_KEY) === "true";
  const query = useQuery({
    queryKey: ["personal-feature-context", user.id],
    queryFn: () => getContext(),
    staleTime: 0,
    gcTime: 0,
    enabled: !kiosk,
  });
  return kiosk
    ? {
        ...query,
        data: undefined,
        isPending: false,
        error: new Error(
          "Sal del modo quiosco y entra con tu cuenta personal para usar este apartado privado",
        ),
      }
    : query;
}

export type PersonalContext = Awaited<ReturnType<typeof getFamilyFeatureContext>>;

export function RecipientPicker({
  context,
  selected,
  onChange,
}: {
  context: PersonalContext;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const members = context.members.filter(
    (member) => member.user_id && member.user_id !== context.userId,
  );
  if (!members.length)
    return (
      <p className="text-sm text-muted-foreground">No hay otros miembros con cuenta individual.</p>
    );
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm">Quién puede consultarlo</legend>
      {members.map((member) => (
        <label key={member.id} className="flex items-center gap-2 break-words text-sm">
          <Checkbox
            checked={selected.includes(member.user_id!)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, member.user_id!]
                  : selected.filter((userId) => userId !== member.user_id),
              )
            }
          />
          {member.display_name}
        </label>
      ))}
    </fieldset>
  );
}
