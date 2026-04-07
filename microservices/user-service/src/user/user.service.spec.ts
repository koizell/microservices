import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { User } from './user.entity';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  const queryBuilder = {
    where: jest.fn(),
    getOne: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
  };
  const emailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(async () => {
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.getOne.mockResolvedValue(null);
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should query email with a safe alias in postgres', async () => {
    await service.findByEmail('Test@Example.com');

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('u');
    expect(queryBuilder.where).toHaveBeenCalledWith('LOWER(u.email) = :email', { email: 'test@example.com' });
    expect(queryBuilder.getOne).toHaveBeenCalled();
  });
});
