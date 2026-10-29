import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mail, Trash, UserRound } from "lucide-react";
import { removeAvatars, uploadAvatar } from "../store/db";
import { useStore } from "../store/store";
import { COLORS } from "./admin/TeamPage";
import { useDialogs } from "./dialogs";
import { Avatar, Button, Card, Field, IconChip, cx, inputClass } from "./ui";

/*
 * Your account: profile picture, name, job title and avatar colour.
 * Email is your sign-in address, so it's shown but not edited here.
 */

const PICTURE_SIZE = 320; // pixels, square

/** Centre-crops an image file to a square JPEG. */
function squareJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PICTURE_SIZE;
      canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image we can read"));
    };
    img.src = url;
  });
}

function SectionTitle({ icon, title }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
      <IconChip icon={icon} tone="brand" size="sm" />
      {title}
    </h2>
  );
}

function PictureCard() {
  const { me, actions } = useStore();
  const { toast, confirm } = useDialogs();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const role = me.isAdmin ? "Admin" : me.role || "Team member";

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still triggers
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose an image file (JPG, PNG or WebP)", "error");
    if (file.size > 15 * 1024 * 1024) return toast("That image is over 15 MB. Choose a smaller one.", "error");
    setBusy(true);
    try {
      const url = await uploadAvatar(me.authUserId, await squareJpeg(file));
      actions.updateMember(me.id, { avatarUrl: url });
      toast("Profile picture updated");
    } catch (err) {
      toast(`Couldn't upload: ${err.message ?? err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    confirm({
      title: "Remove profile picture?",
      message: "Your initials will show instead.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        actions.updateMember(me.id, { avatarUrl: "" });
        await removeAvatars(me.authUserId).catch(() => {});
        toast("Profile picture removed");
      },
    });

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="h-24 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600">
        <div className="h-full bg-[radial-gradient(rgb(255_255_255/0.18)_1px,transparent_1px)] [background-size:14px_14px]" />
      </div>
      <div className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Change profile picture"
          className="group relative rounded-full ring-4 ring-surface"
        >
          <Avatar member={me} size="xl" />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-6" />
          </span>
          {busy && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white">
              <Loader2 className="size-6 animate-spin" />
            </span>
          )}
          <span className="absolute right-0.5 bottom-0.5 grid size-8 place-items-center rounded-full bg-brand-500 text-white shadow-soft ring-2 ring-surface">
            <Camera className="size-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="hidden" />
        <p className="mt-3 text-lg font-extrabold tracking-tight text-stone-900">{me.name}</p>
        <p className="text-sm text-stone-500">{me.email}</p>
        <span className="mt-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{role}</span>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="primary" icon={Camera} disabled={busy} onClick={() => fileRef.current?.click()}>
            {me.avatarUrl ? "Change picture" : "Upload picture"}
          </Button>
          {me.avatarUrl && (
            <Button size="sm" variant="ghost" icon={Trash} disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailsCard() {
  const { me, actions } = useStore();
  const { toast } = useDialogs();
  const initial = { name: me.name, role: me.role ?? "", color: me.color };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState({});
  // Pick up changes made elsewhere (e.g. the admin renamed you) while nothing is being edited.
  const key = JSON.stringify(initial);
  const [savedKey, setSavedKey] = useState(key);
  useEffect(() => {
    if (key !== savedKey) {
      setValues(JSON.parse(key));
      setSavedKey(key);
    }
  }, [key, savedKey]);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e?.target ? e.target.value : e }));
  const changed = JSON.stringify(values) !== key;

  const save = (e) => {
    e.preventDefault();
    const errs = {};
    if (!values.name.trim()) errs.name = "Your name is required";
    setError(errs);
    if (Object.keys(errs).length) return;
    const next = { name: values.name.trim(), role: values.role.trim(), color: values.color };
    actions.updateMember(me.id, next);
    setValues(next);
    toast("Profile saved");
  };

  return (
    <Card className="p-5">
      <form onSubmit={save} noValidate>
        <SectionTitle icon={UserRound} title="Your details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={error.name}>
            <input value={values.name} onChange={set("name")} autoComplete="name" className={inputClass} />
          </Field>
          <Field label="Job title">
            <input value={values.role} onChange={set("role")} placeholder="Team member" className={inputClass} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <span className="relative block">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
              <input value={me.email} disabled className={cx(inputClass, "pl-10")} />
            </span>
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold text-stone-600">Avatar colour</span>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Avatar colour">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={values.color === c}
                  aria-label={c}
                  onClick={() => set("color")(c)}
                  style={{ background: c }}
                  className={cx("size-8 rounded-full transition", values.color === c ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-surface" : "hover:scale-110")}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button disabled={!changed} onClick={() => (setValues(JSON.parse(key)), setError({}))}>
            Discard
          </Button>
          <Button type="submit" variant="primary" disabled={!changed}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  return (
    <div className="@container mx-auto max-w-5xl">
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24">
          <PictureCard />
        </div>
        <div className="space-y-4">
          <DetailsCard />
        </div>
      </div>
    </div>
  );
}
