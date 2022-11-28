import type SlAlert from "@shoelace-style/shoelace/dist/components/alert/alert.js";
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import IconWarning from "~icons/material-symbols/warning-outline-rounded";
import IconInfo from "~icons/material-symbols/info-outline-rounded";
import IconSuccess from "~icons/material-symbols/check-circle-outline-rounded";
import IconDanger from "~icons/material-symbols/dangerous-outline-rounded";
import { Icon } from "./Icon.jsx";

/**
 * Creates a toast imperatively.
 *
 * !only works client side
 *
 * @example
 *  showToast({
 *    variant: "success",
 *    title: "Success",
 *    message: "dss",
 *  });
 */
export function showToast(props: Props) {
	// render the toast on the document body.
	// rendering instead of Portal avoids bugs that have been encountered
	return render(() => <Toast {...props}></Toast>, document.body);
}

type Props = {
	variant: "info" | "success" | "warning" | "danger";
	title: string;
	message: string;
	/** defaults to 2000 */
	duration?: number;
};

// the positioning is defined by https://shoelace.style/components/alert?id=the-toast-stack
// aka the app.css file.
function Toast(props: Props) {
	let alert: SlAlert | undefined;

	onMount(() => {
		alert?.toast();
	});

	return (
		<>
			<sl-alert
				ref={alert}
				prop:variant={props.variant === "info" ? "primary" : props.variant}
				prop:closable={props.variant === "success" ? false : true}
				prop:duration={
					props.variant === "danger" ? undefined : props.duration ?? 2000
				}
			>
				<Icon name={props.variant} slot="icon"></Icon>
				<h3 class="font-bold">{props.title}</h3>
				<p>{props.message}</p>
			</sl-alert>
		</>
	);
}