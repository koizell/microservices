export class User {
  id: string;
  name: string;
  email: string;
  password: string;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
