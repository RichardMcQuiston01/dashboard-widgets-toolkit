import type { ComponentObjectPropsOptions } from 'vue';

/**
 * Declares runtime props for a component made with `defineComponent(setup,
 * options)`. Vue only casts a bare attribute (`<Dashboard draggable />`) to
 * `true` for a prop declared with `type: Boolean`; a plain array declaration
 * passes the empty string, which every `?? false` check then treats as set,
 * or an attribute the prop never reads. `booleanProps` get Boolean casting and
 * keep `undefined` when absent (`default: undefined`), so a component's own
 * defaults (`toolbar` is on unless set) still apply.
 */
export function declareProps<Props extends object>(
  props: readonly (keyof Props)[],
  booleanProps: readonly (keyof Props)[] = []
): ComponentObjectPropsOptions<Props> {
  const declared: Record<string, unknown> = {};
  for (const name of props) declared[String(name)] = null;
  for (const name of booleanProps) {
    declared[String(name)] = { type: Boolean, default: undefined };
  }
  return declared as ComponentObjectPropsOptions<Props>;
}
