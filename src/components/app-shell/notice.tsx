import { FormMessage } from "@/components/forms/form-message";
import { noticeText } from "@/lib/notice";

/** Confirmation banner for `?notice=` after a redirect. */
export function Notice({ value }: { value: unknown }) {
  const text = noticeText(value);
  return text ? (
    <div className="mb-4">
      <FormMessage success={text} />
    </div>
  ) : null;
}
