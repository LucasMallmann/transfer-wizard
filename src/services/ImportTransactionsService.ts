import { getCustomRepository, getRepository, In } from 'typeorm';
import path from 'path';
import fs from 'fs';
import parse from 'csv-parse';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

import uploadConfig from '../config/upload';
import Category from '../models/Category';

interface Request {
  filename: string;
}

interface CsvTransaction {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}

class ImportTransactionsService {
  async execute({ filename }: Request): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);
    const csvPath = path.join(uploadConfig.directory, filename);

    const contactsReadStream = fs.createReadStream(csvPath);

    const parsers = parse({
      from_line: 2,
    });

    const parsedCSV = contactsReadStream.pipe(parsers);

    const transactions: CsvTransaction[] = [];
    const categories: string[] = [];

    parsedCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value || !category) {
        return;
      }

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    // Wait for the file to finish reading
    await new Promise(resolve => parsedCSV.on('end', resolve));

    const existingCategories = await categoriesRepository.find({
      where: { title: In(categories) },
    });

    const existingCategoriesTitles = existingCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !existingCategoriesTitles.includes(category))
      .filter((item, index) => categories.indexOf(item) === index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existingCategories];

    const createTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createTransactions);

    await fs.promises.unlink(csvPath);

    return createTransactions;
  }
}

export default ImportTransactionsService;
