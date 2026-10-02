// Uploaded avatar if the account has one, otherwise a coloured initial.
export default function UserAvatar({ user, size = 32 }) {
  const label = user?.name || user?.email || "Anonymous";
  const initial = label.charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };

  if (user?.image) {
    return <img className="user-avatar" style={style} src={user.image} alt="" />;
  }
  return (
    <div className="user-avatar user-avatar-fallback" style={style}>
      {initial}
    </div>
  );
}
