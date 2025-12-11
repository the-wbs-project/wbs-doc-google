import { Injectable, ViewChild } from '@angular/core';
import { ToastComponent, ToastUtility } from '@syncfusion/ej2-angular-notifications';
import { DialogUtility } from '@syncfusion/ej2-angular-popups';

@Injectable({
    providedIn: 'root'
})
export class MessageService {
    @ViewChild('toast') toast?: ToastComponent;

    // We need a way to register the toast component if we use the component approach
    // Alternatively, we can use ToastUtility which might not need a component reference if it creates one dynamically,
    // but usually ToastUtility is static. Let's try to use the component approach for better control if possible,
    // or use a signal/subject to communicate with a global toast component.
    // Actually, for simplicity and ensuring it works from anywhere, let's assume we will have a way to set the toast instance.

    private toastInstance: ToastComponent | undefined;

    registerToast(toast: ToastComponent) {
        this.toastInstance = toast;
    }

    alert(message: string, title: string = 'Notification', type: 'success' | 'info' | 'warning' | 'error' = 'info') {
        if (this.toastInstance) {
            this.toastInstance.show({
                title: title,
                content: message,
                cssClass: `e-toast-${type}`,
                icon: `e-${type} toast-icons`,
                position: { X: 'Right', Y: 'Top' }
            });
        } else {
            // Fallback or use ToastUtility if component not found
            ToastUtility.show({
                title: title,
                content: message,
                cssClass: `e-toast-${type}`,
                icon: `e-${type} toast-icons`,
                position: { X: 'Right', Y: 'Top' },
                timeOut: 5000,
            });
        }
    }

    confirm(message: string, title: string = 'Confirm'): Promise<boolean> {
        return new Promise((resolve) => {
            const dialog = DialogUtility.confirm({
                title: title,
                content: message,
                okButton: {
                    text: 'OK', click: () => {
                        dialog.hide();
                        resolve(true);
                    }
                },
                cancelButton: {
                    text: 'Cancel', click: () => {
                        dialog.hide();
                        resolve(false);
                    }
                },
                showCloseIcon: true,
                closeOnEscape: true,
                animationSettings: { effect: 'Zoom' }
            });
        });
    }
}
