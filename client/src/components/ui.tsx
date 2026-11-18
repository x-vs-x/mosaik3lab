import { CircleAlert, Info, LoaderCircle, type LucideIcon } from 'lucide-react';
import {
  Fragment,
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'md' | 'lg' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
  secondary: 'bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 hover:ring-stone-400',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  ghost: 'text-stone-700 hover:bg-stone-100 hover:text-stone-900',
  danger: 'bg-rose-700 text-white shadow-sm hover:bg-rose-800',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-[44px] px-3.5 text-hinweis gap-1.5 rounded-xl',
  md: 'min-h-[44px] px-4 text-base gap-2 rounded-xl sm:min-h-12 sm:px-5',
  lg: 'min-h-12 px-5 text-base gap-2.5 rounded-xl sm:min-h-14 sm:px-6 sm:rounded-2xl',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(
    // wrap-break-word: Beschriftungen brechen nur zwischen Wörtern (die globale Regel „anywhere“ würde Knöpfe in Flex-Reihen zusammendrücken)
    'inline-flex max-w-full items-center justify-center text-center font-bold wrap-break-word transition-colors duration-150 select-none',
    'disabled:cursor-not-allowed disabled:opacity-55',
    variants[variant],
    sizes[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant, size, icon: Icon, loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-5 shrink-0" aria-hidden />
      )}
      {children}
    </button>
  );
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
}

export function LinkButton({ variant, size, icon: Icon, children, className, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className as string)} {...rest}>
      {Icon && <Icon className="size-5 shrink-0" aria-hidden />}
      {children}
    </Link>
  );
}

export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return (
    <Tag className={cx('rounded-2xl border border-stone-200/80 bg-white sm:rounded-3xl', className)}>
      {children}
    </Tag>
  );
}

export function Badge({ children, className, icon: Icon }: { children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-hinweis font-bold leading-none ring-1 ring-inset',
        className ?? 'bg-stone-100 text-stone-700 ring-stone-200',
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge className="bg-amber-50 text-amber-900 ring-amber-300" >
      Beispiel
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  shortDescription,
}: {
  title: string;
  description?: ReactNode;
  /** Kurzfassung für schmale Bildschirme; ohne sie entfallen lange Texte (> 90 Zeichen) auf dem Handy. */
  shortDescription?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    // Ab sm nebeneinander; reicht der Platz nicht (große Schrift, Tablet hoch), rutschen die Knöpfe unter den Titel,
    // statt ihn auf wenige Buchstaben je Zeile zusammenzudrücken.
    <header className="mb-4 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:flex-wrap sm:gap-4 sm:items-end sm:justify-between">
      <div className="max-w-3xl sm:min-w-0 sm:flex-[1_1_18rem]">
        {eyebrow && <p className="mb-1.5 hidden text-hinweis font-bold uppercase sm:block sm:text-sm tracking-wider text-brand-700">{eyebrow}</p>}
        <h1 className="text-titel font-bold tracking-tight wrap-anywhere text-stone-900 sm:text-[2.2rem]">{title}</h1>
        {description && (
          <>
            {shortDescription && <p className="mt-1.5 text-stone-700 sm:hidden">{shortDescription}</p>}
            <p
              className={cx(
                'mt-1.5 text-stone-700 sm:mt-2 sm:text-[1.05rem]',
                shortDescription ? 'hidden sm:block' : typeof description === 'string' && description.length > 90 && 'hidden sm:block',
              )}
            >
              {description}
            </p>
          </>
        )}
      </div>
      {/* Handy: Aktionen teilen sich die volle Breite; ab sm rechts neben dem Titel */}
      {actions && <div className="flex flex-wrap gap-2 sm:ml-auto sm:max-w-full sm:shrink-0 sm:gap-3 [&>*]:grow sm:[&>*]:grow-0">{actions}</div>}
    </header>
  );
}

/**
 * E-Mail-Adresse, die vor dem @ und vor Punkten umbricht (statt mitten im Wort) – ohne Trennstriche, die wie ein Teil
 * der Adresse aussähen. Text ohne @ (z. B. ein Name) bleibt unverändert.
 */
export function Email({ adresse }: { adresse: string }) {
  const at = adresse.indexOf('@');
  if (at <= 0) return <>{adresse}</>;
  const teile = [adresse.slice(0, at), ...adresse.slice(at).split(/(?=\.)/)];
  return (
    <span className="hyphens-manual">
      {teile.map((teil, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {teil}
        </Fragment>
      ))}
    </span>
  );
}

/** Beschriftung mit Kurzform auf dem Handy (unter sm) und voller Form ab Tablet – Screenreader lesen jeweils die sichtbare. */
export function KurzLang({ kurz, lang }: { kurz: string; lang: string }) {
  return (
    <>
      <span className="sm:hidden">{kurz}</span>
      <span className="hidden sm:inline">{lang}</span>
    </>
  );
}

export function Spinner({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-stone-600">
      <LoaderCircle className="size-6 animate-spin text-brand-700" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Alert({
  kind = 'info',
  title,
  children,
  className,
}: {
  kind?: 'info' | 'error' | 'warning';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    error: 'border-rose-200 bg-rose-50 text-rose-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
  }[kind];
  const Icon = kind === 'info' ? Info : CircleAlert;
  return (
    <div role={kind === 'error' ? 'alert' : undefined} className={cx('flex gap-2.5 rounded-xl border p-3 sm:gap-3 sm:rounded-2xl sm:p-4', styles, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 wrap-anywhere text-hinweis hyphens-auto sm:text-base sm:hyphens-manual">
        {title && <p className="font-bold">{title}</p>}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  headingLevel: Heading = 'h2',
}: {
  icon: LucideIcon;
  title: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-stone-200 bg-white/60 px-4 py-10 text-center sm:px-6 sm:py-14">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon className="size-8" aria-hidden />
      </div>
      <Heading className="text-abschnitt font-bold text-stone-900 sm:text-xl">{title}</Heading>
      {children && <div className="mt-2 max-w-md text-stone-600">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularfelder – immer mit sichtbarem Label, Hinweis und Fehlermeldung.

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block font-bold text-stone-800">
        {label}
        {required && (
          <span className="ml-1 text-rose-700" aria-hidden>
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="mb-2 text-hinweis text-stone-600">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: !!error })}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-hinweis font-bold text-rose-700">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = (invalid?: boolean) =>
  cx(
    'block w-full min-h-[44px] rounded-xl border bg-white px-4 py-2 text-base sm:min-h-12 sm:py-2.5 text-stone-900 placeholder:text-stone-500',
    'transition-colors focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/20',
    invalid ? 'border-rose-500' : 'border-stone-300 hover:border-stone-400',
  );

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputClass(invalid), className)} aria-invalid={invalid || undefined} {...rest} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx(inputClass(invalid), 'min-h-28 resize-y leading-relaxed', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      className={cx(inputClass(invalid), 'appearance-none bg-[length:1.25rem] bg-[right_0.9rem_center] bg-no-repeat pr-11 select-chevron', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Ein-/Aus-Schalter (role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  srLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Name für Screenreader, wenn die sichtbare Beschriftung allein nicht reicht (z. B. in Listen: welches Druckteil?). */
  srLabel?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={srLabel}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'group/switch inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        )}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden
          className={cx(
            'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
            checked ? 'bg-brand-700' : 'bg-stone-300',
          )}
        >
          <span
            className={cx(
              'inline-block size-6 rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-7' : 'translate-x-1',
            )}
          />
        </span>
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer wrap-anywhere">
        <span className="block font-bold text-stone-800">{label}</span>
        {description && (
          <span id={`${id}-d`} className="block text-hinweis text-stone-600">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rahmen für Vorgänge: jeder Vorgang (Anfrage, Vorschlag, Bearbeiten, Export …) sitzt in einem Panel
// mit Überschrift (h2), optionaler Beschreibung, Inhalt und abgesetzter Aktionsleiste.

type PanelTone = 'default' | 'danger';

/** Gerahmter Bereich mit Überschrift. `icon` ist optional, `actions` erscheint rechts neben der Überschrift. */
export function Panel({
  title,
  description,
  icon: Icon,
  actions,
  footer,
  tone = 'default',
  headingLevel: Heading = 'h2',
  children,
  className,
  bodyClassName,
  id,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Aktionsleiste unten – siehe `ActionBar`. */
  footer?: ReactNode;
  tone?: PanelTone;
  headingLevel?: 'h2' | 'h3';
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <Card
      as="section"
      className={cx(tone === 'danger' && 'border-rose-300 bg-rose-50/40', className)}
      {...{ id, 'aria-labelledby': headingId }}
    >
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:pt-6">
        {/* Handy: Symbol neben dem Titel, Erklärung darunter über die volle Breite; ab sm Symbol links neben Titel + Text. */}
        <div className={cx('grid min-w-0 items-center gap-x-3 sm:items-start sm:gap-x-4', Icon ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')}>
          {Icon && (
            <span
              className={cx(
                'grid size-9 shrink-0 place-items-center rounded-xl sm:row-span-2 sm:size-12 sm:rounded-2xl',
                tone === 'danger' ? 'bg-rose-100 text-rose-800' : 'bg-brand-50 text-brand-700',
              )}
            >
              <Icon className="size-5 sm:size-6" aria-hidden />
            </span>
          )}
          <Heading id={headingId} className={cx('wrap-anywhere text-abschnitt font-bold sm:text-xl', tone === 'danger' ? 'text-rose-900' : 'text-stone-900')}>
            {title}
          </Heading>
          {description && (
            <div className={cx('mt-1.5 wrap-anywhere text-hinweis text-stone-700 sm:mt-1 sm:max-w-prose sm:text-base', Icon && 'col-span-2 sm:col-span-1 sm:col-start-2')}>{description}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children != null && <div className={cx('px-4 py-4 sm:px-7 sm:py-6', bodyClassName)}>{children}</div>}
      {footer && (
        <div className="rounded-b-2xl border-t border-stone-200 bg-stone-50/70 px-4 py-3 sm:rounded-b-3xl sm:px-7 sm:py-4">{footer}</div>
      )}
    </Card>
  );
}

/**
 * Aktionsleiste am Ende eines Vorgangs: die primäre Aktion steht zuerst/rechts (auf dem Handy oben, volle Breite),
 * Abbrechen o. ä. als ruhige Schaltfläche daneben.
 */
export function ActionBar({
  primary,
  secondary,
  hint,
  className,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end', className)}>
      {hint && <p className="text-hinweis text-stone-700 sm:mr-auto">{hint}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center [&>*]:max-sm:w-full">
        {secondary}
        {primary}
      </div>
    </div>
  );
}

/** Eine Liste von Panels/Karten mit einheitlichem Abstand. */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('space-y-4 sm:space-y-6', className)}>{children}</div>;
}
