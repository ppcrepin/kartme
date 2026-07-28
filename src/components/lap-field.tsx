import { Field } from '@/components/ui';
import { formatDigits, onlyDigits } from '@/lib/laptime';

/**
 * Champ chrono « pavé numérique » (retour PO 2026-07-28).
 *
 * On ne tape QUE des chiffres : ils se remplissent de la droite vers la gauche
 * et les séparateurs se placent seuls (0:52.348). Plus de « : » ni de « . » à
 * viser sur un clavier de téléphone, au bord d'une piste, entre deux courses.
 *
 * L'état remonté au parent est la chaîne de CHIFFRES BRUTS — la valeur affichée
 * n'est qu'une mise en forme. Le parent la convertit avec digitsToMs().
 */
export function LapField({
  label,
  digits,
  onChangeDigits,
  error,
}: {
  label: string;
  digits: string;
  onChangeDigits: (next: string) => void;
  error?: string | null;
}) {
  // La valeur affichée n'est qu'une projection des chiffres : pas d'état à
  // synchroniser, donc pas de ref.
  const shown = formatDigits(digits);

  function onChangeText(text: string) {
    const next = onlyDigits(text);
    // Effacement d'un SÉPARATEUR : le texte a raccourci mais le nombre de
    // chiffres n'a pas bougé. Sans ce cas, la touche « retour » resterait
    // sans effet une frappe sur deux et le champ paraîtrait bloqué.
    if (text.length < shown.length && next.length === digits.length) {
      onChangeDigits(digits.slice(0, -1));
      return;
    }
    onChangeDigits(next);
  }

  return (
    <Field
      label={label}
      value={shown}
      onChangeText={onChangeText}
      placeholder="0:00.000"
      keyboardType="number-pad"
      inputMode="numeric"
      error={error}
    />
  );
}
