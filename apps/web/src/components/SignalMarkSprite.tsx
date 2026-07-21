type SignalMarkSize = "xs" | "sm" | "md";

interface Props {
  playing?: boolean;
  size?: SignalMarkSize;
  className?: string;
}

export function SignalMarkSprite({ playing = false, size = "md", className = "" }: Props) {
  const classes = [
    "mp5-signal-mark",
    `mp5-signal-mark--${size}`,
    playing ? "is-playing" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} aria-hidden data-testid="signal-mark-sprite" />;
}