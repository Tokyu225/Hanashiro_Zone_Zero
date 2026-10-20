import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { RegisterPageModule } from './register.module';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let component: RegisterPage;
  let fixture: ComponentFixture<RegisterPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPageModule, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be invalid when empty', () => {
    expect(component.registerForm.valid).toBeFalsy();
  });

  it('should detect mismatched passwords', () => {
    component.registerForm.setValue({
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'different123',
    });

    expect(component.registerForm.hasError('passwordMismatch')).toBeTruthy();
    expect(component.registerForm.valid).toBeFalsy();
  });

  it('should accept matching passwords', () => {
    component.registerForm.setValue({
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    expect(component.registerForm.valid).toBeTruthy();
  });
});
