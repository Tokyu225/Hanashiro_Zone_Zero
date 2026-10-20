import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  private formBuilder = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loginForm: FormGroup;
  showPassword = false;
  submitted = false;
  submitting = false;
  errorMessage = '';
  successMessage = '';

  constructor() {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });

    if (this.route.snapshot.queryParamMap.get('registered') === '1') {
      this.successMessage = 'Account created successfully. Please sign in.';
    }
  }

  get email() {
    return this.loginForm.controls['email'];
  }

  get password() {
    return this.loginForm.controls['password'];
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const { email, password } = this.loginForm.value;
    const result = await this.auth.login(email, password);
    this.submitting = false;

    if (!result.success) {
      this.errorMessage = result.message;
      return;
    }

    await this.router.navigateByUrl('/tabs/tab1', { replaceUrl: true });
  }
}
